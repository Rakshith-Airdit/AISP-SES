sap.ui.define(["sap/ui/core/mvc/Controller"], (Controller) => {
  "use strict";

  return Controller.extend(
    "com.aisp.aispsupplierportal.controller.ListReport",
    {
      onInit() {
        let oModel = this.getOwnerComponent().getModel();
        let oView = this.getView();

        oModel.read("/SESHeaderList", {
          success: function (oData, oRes) {
            console.log(oData, oRes);
          },
          error: function (oErr) {
            console.error(oErr);
          },
        });

        const customizeConfig = {
          autoColumnWidth: {
            "*": {
              min: 1,
              max: 10,
              gap: 3,
              truncateLabel: true,
            },
          },
        };
        const oSmartTable = this.getView().byId("idOpenSrvPOTable");

        const oViewModel = new sap.ui.model.json.JSONModel({
          selectedTab: "OpenSRVPO",
        });

        this.getView().setModel(oViewModel, "viewModel");
      },

      onIconTabBarSelect: function (oEvent) {
        const selectedKey = oEvent.getParameter("key");
        if (selectedKey === "OpenSRVPO") {
          const oSmartTable = this.byId("idOpenSrvPOTable");
          if (oSmartTable) {
            oSmartTable.rebindTable();
            this.getView().byId("idSmartFilter_1").setVisible(true);
            this.getView().byId("idSmartFilter_2").setVisible(false);
          }
        } else if (selectedKey === "SRVEntrySheet") {
          const oSmartTable = this.byId("idServiceEntrySmartTable");
          if (oSmartTable) {
            oSmartTable.rebindTable();
            this.getView().byId("idSmartFilter_1").setVisible(false);
            this.getView().byId("idSmartFilter_2").setVisible(true);
          }
        }
      },

      onListItemPress: function (oEvent) {
        let oView = this.getView();
        const oRow = oEvent.getSource();
        let oTable = oRow;

        while (oTable && !(oTable instanceof sap.m.Table)) {
          oTable = oTable.getParent();
        }

        let route;
        let args = {};
        const sTableId = oTable.getId();
        const oRouter = this.getOwnerComponent().getRouter();

        if (sTableId === this.createId("idServicePOTable")) {
          const { Ebeln, ServicePOType } = oEvent
            .getSource()
            .getBindingContext()
            .getObject();
          args = { poNo: Ebeln, srvType: ServicePOType };
          route = "RouteMultiPage";
        } else if (sTableId === this.createId("idServiceEntryTable")) {
          const { PO_NUMBER, REQUEST_NO } = oEvent
            .getSource()
            .getBindingContext()
            .getObject();
          args = { poNo: PO_NUMBER, reqNo: REQUEST_NO };
          route = "RouteSrvEntry";
        }

        oRouter.navTo(route, args);
      },

      formatStatusState: function (sStatus) {
        switch (sStatus) {
          case "Pending":
            return "Indication13";
          case "Partial":
            return "Indication17";
          case "Completed":
            return "Indication14";
          default:
            return "None";
        }
      },

      formatSESStatusState: function (sStatus) {
        if (sStatus === "Approved") {
          return "Indication13";
        }
        if (sStatus.includes("In-Process")) {
          return "Indication17";
        }
        if (sStatus === "Rejected") {
          return "Indication11";
        }
        return "None";
      },

      formatDate: function (dateValue) {
        if (!dateValue || !(dateValue instanceof Date)) return "";
        const day = String(dateValue.getDate()).padStart(2, "0");
        const month = String(dateValue.getMonth() + 1).padStart(2, "0");
        const year = dateValue.getFullYear();
        return `${day}-${month}-${year}`;
      },

      formatCalculatedAmount: function (oContext) {
        if (!oContext) return "0";
        debugger;
        const aItems = oContext.getProperty("to_Items/results") || [];
        const total = aItems.reduce((sum, item) => {
          const price = Number(item.UNIT_PRICE) || 0;
          const qty = Number(item.SERVICE_QUANTITY) || 0;
          return sum + price * qty;
        }, 0);

        return total.toFixed(2);
      },

      // calculateAmount: function (itemData) {
      //     debugger;
      //     let oModel = this.getView().getModel();
      //     let oData = oModel.oData;
      //     let total = 0;
      //     itemData.forEach(item => {
      //         let itemData = oData[item]
      //         total += Number(itemData.UNIT_PRICE), Number(itemData.SERVICE_QUANTITY)
      //         console.log(total)
      //     })

      //     return total;
      //     // if (items.UNIT_PRICE && items.SERVICE_QUANTITY) {
      //     //     console.log(Number(items.UNIT_PRICE) * Number(items.SERVICE_QUANTITY));
      //     //     return Number(items.UNIT_PRICE) * Number(items.SERVICE_QUANTITY);
      //     // }
      //     // return 0;
      // },
    }
  );
});

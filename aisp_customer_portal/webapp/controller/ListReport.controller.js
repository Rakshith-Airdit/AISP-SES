sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
  ],
  (Controller, Filter, FilterOperator, Sorter) => {
    "use strict";

    return Controller.extend(
      "com.invoiceappairdit.invoiceapprovalairdit.aispcustomerportal.controller.ListReport",
      {
        onInit() {
          let oRouter = sap.ui.core.UIComponent.getRouterFor(this);
          oRouter
            .getRoute("RouteListReport")
            .attachPatternMatched(this.attachPatternApp, this);
        },

        attachPatternApp: function () {
          this.byId("smartTablePending").rebindTable();
          this.byId("smartTableApproved").rebindTable();
          this.byId("smartTableRejected").rebindTable();
        },

        onBeforeRebindTable: function (oEvent) {
          const oBindingParams = oEvent.getParameter("bindingParams");
          const sTableId = oEvent.getSource().getId();
          let oFilter;

          switch (sTableId) {
            case this.createId("smartTablePending"):
              oFilter = new Filter(
                "SES_STATUS",
                FilterOperator.Contains,
                "In-Process"
              );
              break;

            case this.createId("smartTableRejected"):
              oFilter = new Filter("SES_STATUS", FilterOperator.EQ, "Rejected");
              break;

            case this.createId("smartTableApproved"):
              oFilter = new Filter("SES_STATUS", FilterOperator.EQ, "Approved");
              break;

            default:
              return;
          }

          oBindingParams.filters.push(oFilter);

          // Check if user has already applied any sorting
          const hasUserSorting =
            oBindingParams.sorter && oBindingParams.sorter.length > 0;

          // Only add default sorter if no user sorting is applied
          if (!hasUserSorting) {
            const oRequestNoSorter = new Sorter("REQUEST_NO", true); // descending
            oBindingParams.sorter = [oRequestNoSorter];
          }
          // If user has applied sorting, oBindingParams.sorter already contains their preference
        },

        onIconTabBarSelect: function (oEvent) {
          const sSelectedKey = oEvent.getParameter("key");

          console.log(sSelectedKey);
        },

        onListItemPress: function (oEvent) {
          // Show loader
          this.getView().setBusy(true);

          // Get the required data from the pressed item
          const oContext = oEvent.getSource().getBindingContext();
          const oItemData = oContext.getObject();
          const iReqNo = oItemData.REQUEST_NO;

          // Navigate to detail page
          this.getOwnerComponent().getRouter().navTo("RouteObjDetailsPage", {
            reqNo: iReqNo,
          });

          // Hide loader when navigation completes
          this.getOwnerComponent()
            .getRouter()
            .attachRouteMatched(() => {
              this.getView().setBusy(false);
            }, this);
        },

        // formatStatusState: function (sStatus) {
        //   switch (sStatus) {
        //     case "Approved":
        //       return "Indication13";
        //     case "In-Process ISP":
        //       return "Indication17";
        //     case "Rejected":
        //       return "Indication11";
        //     default:
        //       return "None";
        //   }
        // },

        formatStatusState: function (sStatus) {
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

        formatEmptyFieldData: function (sData) {
          if (sData) {
            return sData;
          } else {
            return `   - `;
          }
        },
      }
    );
  }
);

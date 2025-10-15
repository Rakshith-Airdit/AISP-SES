sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/export/library",
    "sap/ui/export/Spreadsheet",
  ],
  (Controller, MessageBox, library, Spreadsheet) => {
    "use strict";

    return Controller.extend(
      "com.aisp.aispsupplierportal.controller.MultiPage",
      {
        onInit() {
          const oRouter = this.getOwnerComponent().getRouter();
          oRouter
            .getRoute("RouteMultiPage")
            .attachPatternMatched(this.onPatternMatched, this);
        },

        onPatternMatched(oEvent) {
          const { poNo, srvType } = oEvent.getParameter("arguments");

          this.poNo = poNo;
          this.srvType = srvType;

          // Model For Controlling the MultiSelect Property for Table Control
          var oSrvTypModel = new sap.ui.model.json.JSONModel({
            srvType: srvType,
          });

          // if (this.srvType === "Un-planned") {
          //     const { reqNo } = oEvent.getParameter("arguments");
          //     this.reqNo = reqNo;
          // }

          var oLogsModel = new sap.ui.model.json.JSONModel({});

          this.getView().setModel(oSrvTypModel, "serviceTypeModel");
          this.getView().setModel(oLogsModel, "logsModel");

          this._oModelRead("SESHeaderList", poNo);
          this._oModelRead("SESItemList", poNo);

          this._oGetLogs();
        },

        onListItemPress: function (oEvent) {
          const { Ebeln, ServicePOType } = oEvent
            .getSource()
            .getBindingContext()
            .getObject();
          this.poNo = Ebeln;
          this.srvType = ServicePOType;

          // if (this.srvType === "Un-planned") {
          //     const { reqNo } = oEvent.getSource().getBindingContext().getObject();
          //     this.reqNo = reqNo;
          // }

          this.getView()
            .getModel("serviceTypeModel")
            .setProperty("/srvType", ServicePOType);
          this._oModelRead("SESHeaderList", Ebeln);
          this._oModelRead("SESItemList", Ebeln);

          this._oGetLogs();
        },

        // onCreateEntrySheet: function (oEvent) {
        //
        //     const oTable = this.getView().byId("idPODetailTable");

        //     let aSelectedItems = oTable.getSelectedItems();

        //     const aSelectedData = [];

        //     if (this.srvType === "Planned") {
        //         if (aSelectedItems.length > 0) {
        //             aSelectedItems.forEach(function (oSelectedItem) {
        //                 const oBindingContext = oSelectedItem.getBindingContext("poDetailModel");
        //                 const oData = oBindingContext.getObject();
        //                 if (oData.SERVICE_QUANTITY === oData.ORDERED_QUANTITY) {
        //                     MessageBox.warning(`Item ${oData.SR_NO} cannot be selected - service already fully utilized`, {
        //                         onClose: function () {
        //                             oTable.setSelectedItem(oSelectedItem, false); // Unselect the item after warning is closed
        //                         }
        //                     });
        //                 } else {
        //                     aSelectedData.push(oData);
        //                 }
        //             });

        //             localStorage.setItem("selectedItems", JSON.stringify({
        //                 srvType: this.srvType, items: aSelectedData
        //             }));

        //             const poModel = new sap.ui.model.json.JSONModel(aSelectedData);
        //             this.getOwnerComponent().setModel(poModel, "selItemModel");

        //             const oRouter = this.getOwnerComponent().getRouter();
        //             oRouter.navTo("RouteObjectPage", { poNo: this.poNo, srvType: this.srvType });
        //         }
        //         else {
        //             MessageBox.warning("No items selected.");
        //         }
        //     } else if (this.srvType === "Un-planned") {
        //         aSelectedItems = this.getView().getModel("poDetailModel").getData()
        //         const oPoData = this.getView().getModel("poModel").getData()[0];
        //         const orderLimit = Number(oPoData.Amount) || 0;
        //         let totalValue = 0;

        //         if (aSelectedItems.length > 0) {
        //             aSelectedItems.forEach(function (oSelectedItem) {
        //                 const itemValue = (Number(oItem.SERVICE_QUANTITY) || 0) *
        //                     (Number(oItem.UNIT_PRICE) || 0);
        //                 totalValue += itemValue;
        //                 aSelectedData.push(oSelectedItem);
        //             });
        //         }

        //         if (totalValue > orderLimit) {
        //             MessageBox.error(`Total value ${totalValue} exceeds order limit ${orderLimit}`);
        //             return;
        //         }

        //         localStorage.setItem("selectedItems", JSON.stringify({
        //             srvType: this.srvType, items: aSelectedData
        //         }));

        //         const poModel = new sap.ui.model.json.JSONModel(aSelectedData);
        //         this.getOwnerComponent().setModel(poModel, "selItemModel");

        //         const oRouter = this.getOwnerComponent().getRouter();
        //         oRouter.navTo("RouteObjectPage", { poNo: this.poNo, srvType: this.srvType });

        //     }
        // },

        onCreateEntrySheet: async function (oEvent) {
          const oTable = this.getView().byId("idPODetailTable");
          let aSelectedItems = oTable.getSelectedItems();
          let hasValidItems = false;
          const aSelectedData = [];

          if (this.srvType === "Planned") {
            if (aSelectedItems.length > 0) {
              // Loop through selected items
              for (let i = 0; i < aSelectedItems.length; i++) {
                const oSelectedItem = aSelectedItems[i];
                const oBindingContext =
                  oSelectedItem.getBindingContext("poDetailModel");
                const oData = oBindingContext.getObject();

                // Check if service quantity is already fully utilized
                if (oData.SERVICE_QUANTITY === oData.ORDERED_QUANTITY) {
                  // Show warning message and wait until the user clicks "OK"
                  await new Promise((resolve) => {
                    MessageBox.warning(
                      `Item ${oData.SR_NO} cannot be selected - service already fully utilized`,
                      {
                        onClose: function () {
                          resolve(); // Resolve the promise when "OK" is clicked
                        },
                      }
                    );
                  });

                  // Unselect the item after the warning is closed
                  oTable.setSelectedItem(oSelectedItem, false);
                } else {
                  aSelectedData.push(oData);
                  hasValidItems = true;
                }
              }

              // Additional validation: Check if we have valid items to proceed
              if (!hasValidItems) {
                MessageBox.error(
                  "No valid items available. All selected items are fully utilized."
                );
                return; // Stop execution and don't navigate
              }

              // Store selected items in localStorage and navigate
              localStorage.setItem(
                "selectedItems",
                JSON.stringify({
                  srvType: this.srvType,
                  items: aSelectedData,
                })
              );

              const poModel = new sap.ui.model.json.JSONModel(aSelectedData);
              this.getOwnerComponent().setModel(poModel, "selItemModel");

              const oRouter = this.getOwnerComponent().getRouter();
              oRouter.navTo("RouteObjectPage", {
                poNo: this.poNo,
                srvType: this.srvType,
              });
            } else {
              MessageBox.warning("No items selected.");
            }
          } else if (this.srvType === "Un-planned") {
            aSelectedItems = this.getView().getModel("poDetailModel").getData();
            const oPoData = this.getView().getModel("poModel").getData()[0];
            const orderLimit = Number(oPoData.Amount) || 0;
            let totalValue = 0;

            if (aSelectedItems.length > 0) {
              aSelectedItems.forEach(function (oSelectedItem) {
                const itemValue =
                  (Number(oSelectedItem.SERVICE_QUANTITY) || 0) *
                  (Number(oSelectedItem.UNIT_PRICE) || 0);
                totalValue += itemValue;
                aSelectedData.push(oSelectedItem);
              });
            }

            if (totalValue > orderLimit) {
              MessageBox.error(
                `Total value ${totalValue} exceeds order limit ${orderLimit}`
              );
              return;
            }

            localStorage.setItem(
              "selectedItems",
              JSON.stringify({
                srvType: this.srvType,
                items: aSelectedData,
              })
            );

            const poModel = new sap.ui.model.json.JSONModel(aSelectedData);
            this.getOwnerComponent().setModel(poModel, "selItemModel");

            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteObjectPage", {
              poNo: this.poNo,
              srvType: this.srvType,
            });
          }
        },

        _oModelRead: function (entity, poNo) {
          const oModel = this.getView().getModel();
          this.getView().byId("idObjectPageLayout").setBusy(true);

          let filterCondition;
          if (entity === "SESHeaderList") {
            filterCondition = new sap.ui.model.Filter("Ebeln", "EQ", poNo);
          } else {
            filterCondition = new sap.ui.model.Filter("PO_NUMBER", "EQ", poNo);
          }

          oModel.read(`/${entity}`, {
            filters: [filterCondition],
            success: function (res) {
              this.getView().byId("idObjectPageLayout").setBusy(false);
              const modelName =
                entity === "SESHeaderList" ? "poModel" : "poDetailModel";
              const poModel = new sap.ui.model.json.JSONModel(res.results);
              this.getView().setModel(poModel, modelName);
            }.bind(this),
            error: function (error) {
              this.getView().byId("idObjectPageLayout").setBusy(false);
              MessageBox.error(
                JSON.parse(error.responseText).error.message.value
              );
              console.error(JSON.parse(error.responseText).error.message.value);
            }.bind(this),
          });
        },

        _oGetLogs: function () {
          const oModel = this.getView().getModel();
          this.getView().byId("idObjectPageLayout").setBusy(true);
          let oLogsModel = this.getView().getModel("logsModel");
          let poNumber = this.poNo;

          if (!poNumber) {
            return;
          }

          // oModel.read("/SES_CREATION_LOGS", {
          //     filters: [new sap.ui.model.Filter("PO_NUMBER", "EQ", poNumber)],
          //     success: function (res) {
          //
          //         this.getView().byId("idObjectPageLayout").setBusy(false);
          //         oLogsModel.setData({ logs: res.results });
          //     }.bind(this),
          //     error: function (error) {
          //         this.getView().byId("idObjectPageLayout").setBusy(false);
          //         MessageBox.error(JSON.parse(error.responseText).error.message.value);
          //         console.error(JSON.parse(error.responseText).error.message.value)
          //     }.bind(this),
          // })

          oModel.read("/SES_CREATION_LOGS", {
            filters: [new sap.ui.model.Filter("PO_NUMBER", "EQ", poNumber)],
            success: function (res) {
              this.getView().byId("idObjectPageLayout").setBusy(false);

              // Get latest log for each request number
              const latestLogsMap = res.results.reduce((acc, log) => {
                const requestNo = log.REQUEST_NO;
                const currentTimestamp = new Date(log.TIMESTAMP);

                if (
                  !acc.has(requestNo) ||
                  currentTimestamp > new Date(acc.get(requestNo).TIMESTAMP)
                ) {
                  acc.set(requestNo, log);
                }

                return acc;
              }, new Map());

              const latestLogs = Array.from(latestLogsMap.values());

              oLogsModel.setData({ logs: latestLogs });
            }.bind(this),
            error: function (error) {
              this.getView().byId("idObjectPageLayout").setBusy(false);
              MessageBox.error(
                JSON.parse(error.responseText).error.message.value
              );
              console.error(JSON.parse(error.responseText).error.message.value);
            }.bind(this),
          });

          // oModel.read("/SES_CREATION_LOGS", {
          //   filters: [new sap.ui.model.Filter("PO_NUMBER", "EQ", poNumber)],
          //   success: function (res) {
          //     this.getView().byId("idObjectPageLayout").setBusy(false);

          //     // Get latest log for each combination of REQUEST_NO and APPROVAL_LEVEL
          //     const latestLogsByLevel = res.results.reduce((acc, log) => {
          //       const levelKey = `${log.REQUEST_NO}_${log.APPROVAL_LEVEL}`;
          //       const currentTimestamp = new Date(log.TIMESTAMP);

          //       if (
          //         !acc[levelKey] ||
          //         currentTimestamp > new Date(acc[levelKey].TIMESTAMP)
          //       ) {
          //         acc[levelKey] = log;
          //       }

          //       return acc;
          //     }, {});

          //     // Convert to array and sort
          //     const latestLogs = Object.values(latestLogsByLevel).sort(
          //       (a, b) => {
          //         if (a.REQUEST_NO !== b.REQUEST_NO) {
          //           return a.REQUEST_NO - b.REQUEST_NO;
          //         }
          //         return a.APPROVAL_LEVEL - b.APPROVAL_LEVEL;
          //       }
          //     );

          //     oLogsModel.setData({ logs: latestLogs });
          //   }.bind(this),
          //   error: function (error) {
          //     this.getView().byId("idObjectPageLayout").setBusy(false);
          //     MessageBox.error(
          //       JSON.parse(error.responseText).error.message.value
          //     );
          //     console.error(JSON.parse(error.responseText).error.message.value);
          //   }.bind(this),
          // });
        },

        formatLogDate: function (sDate) {
          if (!sDate) return "";

          const oDate = new Date(sDate); // ensure it's a valid Date object
          const oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance(
            {
              pattern: "dd MMM yyyy",
            }
          );

          return oDateFormat.format(oDate);
        },

        onSearchSESHeaderList: function (oEvent) {
          const sQuery = oEvent.getSource().getValue().trim();
          const oList = this.byId("idSESHeaderList");
          const oBinding = oList.getBinding("items");

          if (!sQuery) {
            oBinding.filter([]);
            return;
          }

          const aFilters = [
            new sap.ui.model.Filter(
              "Ebeln",
              sap.ui.model.FilterOperator.EQ,
              sQuery
            ),
            // new sap.ui.model.Filter("HeaderStaus", sap.ui.model.FilterOperator.Contains, sQuery)
            // new sap.ui.model.Filter("Amount", sap.ui.model.FilterOperator.EQ, sQuery)
          ];

          const oCombinedFilter = new sap.ui.model.Filter({
            filters: aFilters,
            and: false,
          });

          oBinding.filter([oCombinedFilter]);
        },

        formatStatusState: function (sStatus) {
          switch (sStatus) {
            case "Completed":
              return "Indication14";
            case "Pending":
              return "Indication13";
            case "Partial":
              return "Indication17";
            default:
              return "None";
          }
        },

        onPressBack: function () {
          const oView = this.getView();
          let oRouter = this.getOwnerComponent().getRouter();
          oView.setBusy(true);

          oRouter.navTo("RouteListReport");

          oRouter.getRoute("RouteListReport").attachPatternMatched(
            () => {
              oView.setBusy(false);
            },
            null,
            { once: true }
          );
        },

        formatOrderAmount: function (amount) {
          if (amount) {
            return Number(amount).toFixed(2);
          }
          return "";
        },

        handleLink1Press: function (oEvent) {
          const oView = this.getView();
          let oRouter = this.getOwnerComponent().getRouter();
          oView.setBusy(true);

          oRouter.navTo("RouteListReport");

          oRouter.getRoute("RouteListReport").attachPatternMatched(
            () => {
              oView.setBusy(false);
            },
            null,
            { once: true }
          );
        },

        onExcelExport: function (oEvent) {
          const oExportBtn = oEvent.getSource();
          const oToolBar = oExportBtn.getParent();
          const oTable = oToolBar.getParent();
          const oColumns = oTable.getColumns();
          const oRowBinding = oTable.getBinding("items");

          const EdmType = library.EdmType;
          const aCols = [];

          oColumns.forEach((col, index) => {
            const sHeader = col.getHeader().getText();

            // Get the cell template for this column
            const oItems = oTable.getItems();
            if (oItems && oItems.length > 0) {
              const oFirstItem = oItems[0];
              const oCells = oFirstItem.getCells();

              if (oCells && oCells.length > index) {
                const oCell = oCells[index];
                const oBinding = oCell.getBinding("text");

                if (oBinding && oBinding.getPath()) {
                  const sProperty = oBinding
                    .getPath()
                    .replace("tableModel>", "");

                  aCols.push({
                    label: sHeader,
                    property: sProperty,
                    type: EdmType.String,
                  });
                }
              }
            }
          });

          const oSettings = {
            workbook: {
              columns: aCols,
            },
            dataSource: oRowBinding,
            fileName: "TableExport.xlsx",
            worker: false,
          };

          const oSheet = new Spreadsheet(oSettings);
          oSheet.build().finally(function () {
            oSheet.destroy();
          });
        },
      }
    );
  }
);

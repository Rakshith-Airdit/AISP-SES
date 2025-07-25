sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
  ],
  function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Fragment
  ) {
    "use strict";

    return Controller.extend(
      "com.aisp.aispsupplierportal.controller.SRVEntry",
      {
        onInit: function () {
          // Initialize router and models
          this._initRouter();
          this._initModels();
        },

        _initRouter: function () {
          const oRouter = this.getOwnerComponent().getRouter();
          oRouter
            .getRoute("RouteSrvEntry")
            .attachPatternMatched(this.onPatternMatched, this);
        },

        _initModels: function () {
          // Set main OData model
          this.getView().setModel(this.getOwnerComponent().getModel());

          // View state model for UI controls
          this.getView().setModel(
            new JSONModel({
              isEditMode: false,
              srvType: "Un-planned", // Default to Un-planned
              showUploader: false,
            }),
            "viewStateModel"
          );
        },

        onPatternMatched: function (oEvent) {
          const { poNo, reqNo } = oEvent.getParameter("arguments");
          this.PO_NUMBER = poNo;
          this.REQ_NUMBER = reqNo;

          this._loadRequestData(reqNo);
          this._updateTableMode();
        },

        _loadRequestData: function (reqNum) {
          let that = this;
          this._setBusy(true);

          this.getView()
            .getModel()
            .read("/SES_Head", {
              filters: [new Filter("REQUEST_NO", "EQ", reqNum)],
              success: function (res) {
                that._setBusy(false);
                if (res.results.length === 0) {
                  MessageToast.show("No request data found");
                  return;
                }
                this._processRequestData(res.results[0]);
              }.bind(this),
              error: function (err) {
                that._setBusy(false);
                console.error("Error loading request data:", err);
                const errorMsg = err.responseText
                  ? JSON.parse(err.responseText).error.message.value
                  : "Error loading request data";
                MessageBox.error(errorMsg);
              },
            });
        },

        _processRequestData: function (oResData) {
          let oViewStateModel = this.getView().getModel("viewStateModel");

          // Calculate total service sheet value
          const totalSrvSheetVal = this._calculateTotalFromItems(
            oResData.to_Items?.results || [],
            oResData.ServicePOType
          );

          // Set data in model
          const srvEntryModel = new JSONModel({
            ...oResData,
            totalSrvSheetVal: totalSrvSheetVal,
          });

          this.getView().setModel(srvEntryModel, "srvEntryModel");

          // Set service type from loaded data
          oViewStateModel.setProperty(
            "/srvType",
            oResData.ServicePOType || "Un-planned"
          );
          // oViewStateModel.setProperty("/srvType", "Un-planned");

          this._updateUIState();
        },

        _calculateTotalFromItems: function (aItems, srvType) {
          return aItems.reduce((total, item) => {
            debugger;
            const unitPrice = Number(item.UNIT_PRICE || 0);
            const quantity = Number(item.SERVICE_QUANTITY || 0);
            return total + unitPrice * quantity;
          }, 0);
        },

        _updateUIState: function () {
          const oViewStateModel = this.getView().getModel("viewStateModel");
          const isEditMode = oViewStateModel.getProperty("/isEditMode");
          const oSrvEntryModel = this.getView().getModel("srvEntryModel");
          const sStatus = oSrvEntryModel.getProperty("/SES_STATUS");
          const aAttachments =
            oSrvEntryModel.getProperty("/to_Attachments/results") || [];

          // Update button visibility
          this.getView()
            .byId("idEditBtn")
            .setVisible(sStatus === "Rejected" && !isEditMode);
          this.getView()
            .byId("idSaveBtn")
            .setVisible(sStatus === "Rejected" && isEditMode);
          this.getView()
            .byId("idDeleteAttachmentButton")
            .setVisible(isEditMode && sStatus === "Rejected");

          // Update uploader visibility
          oViewStateModel.setProperty(
            "/showUploader",
            isEditMode && aAttachments.length === 0
          );
        },

        _updateTableMode: function () {
          const oTable = this.byId("serviceEntryProductsTable");
          const oViewStateModel = this.getView().getModel("viewStateModel");

          const isMultiSelect =
            oViewStateModel.getProperty("/isEditMode") &&
            oViewStateModel.getProperty("/srvType") === "Un-planned";

          oTable.setMode(isMultiSelect ? "MultiSelect" : "None");
        },

        onInputChange: function (oEvent) {
          const oInput = oEvent.getSource();
          const oModel = this.getView().getModel("srvEntryModel");
          const sValue = oInput.getValue();
          const sID = oInput.getId();
          const srvType = this.getView()
            .getModel("viewStateModel")
            .getProperty("/srvType");
          const oItem = oInput.getBindingContext("srvEntryModel").getObject();

          // First validate the input format
          if (!this._validateInputFormat(oInput, sValue)) {
            return;
          }

          if (srvType === "Planned") {
            this._handlePlannedInputChange(oInput, sValue, oItem);
          } else if (srvType === "Un-planned") {
            this._handleUnplannedInputChange(
              oInput,
              sValue,
              sID,
              oItem,
              oModel
            );
          }

          // Recalculate totals after any change
          this._updateTotalPrice();
        },

        _handlePlannedInputChange: function (oInput, sValue, oItem) {
          oItem.SERVICE_QUANTITY_INPUT = sValue;

          // Validate against ordered quantity
          const orderedQty = Number(oItem.ORDERED_QUANTITY) || 0;
          const servicedQty = Number(oItem.SERVICE_QUANTITY) || 0;
          const inputQty = Number(sValue) || 0;
          const remainingQty = orderedQty - servicedQty;

          if (inputQty > remainingQty) {
            this._setInputErrorState(
              oInput,
              `Quantity exceeds remaining allowed (max ${remainingQty})`
            );
          } else {
            oInput.setValueState(sap.ui.core.ValueState.None);
          }
        },

        _handleUnplannedInputChange: function (
          oInput,
          sValue,
          sID,
          oItem,
          oModel
        ) {
          // First parse the new value
          const newValue = Number(sValue) || 0;

          // Get current values
          const currentQty = Number(oItem.SERVICE_QUANTITY) || 0;
          const currentPrice = Number(oItem.UNIT_PRICE) || 0;
          const orderLimit = Number(oModel.getProperty("/AMOUNT")) || 0;

          if (sID.includes("SrvQtyInput")) {
            // Calculate what the new total would be with this quantity
            const potentialTotal = newValue * currentPrice;

            if (potentialTotal > orderLimit) {
              // Revert to previous valid value
              oInput.setValue(currentQty.toString());
              this._setInputErrorState(
                oInput,
                `Total value ${potentialTotal} exceeds order limit ${orderLimit}`
              );
              return; // Exit without updating the model
            }

            // Update model if validation passes
            oItem.SERVICE_QUANTITY = newValue;
          } else if (sID.includes("UnitPriceInput")) {
            // Calculate what the new total would be with this price
            const potentialTotal = newValue * currentQty;

            if (potentialTotal > orderLimit) {
              // Revert to previous valid value
              oInput.setValue(currentPrice.toString());
              this._setInputErrorState(
                oInput,
                `Total value ${potentialTotal} exceeds order limit ${orderLimit}`
              );
              return; // Exit without updating the model
            }

            // Update model if validation passes
            oItem.UNIT_PRICE = newValue;
          }

          // Clear any previous error state if validation passed
          oInput.setValueState(sap.ui.core.ValueState.None);

          // Recalculate totals (though we know it's valid now)
          this._updateTotalPrice();
        },

        _updateTotalPrice: function () {
          const oModel = this.getView().getModel("srvEntryModel");
          const aItems = oModel.getProperty("/to_Items/results") || [];
          const srvType = this.getView()
            .getModel("viewStateModel")
            .getProperty("/srvType");
          const orderLimit = Number(oModel.getProperty("/AMOUNT") || 0);

          try {
            let totalSrvSheetVal = 0;

            if (srvType === "Planned") {
              totalSrvSheetVal = this._calculatePlannedTotal(aItems);
            } else if (srvType === "Un-planned") {
              totalSrvSheetVal = this._calculateUnplannedTotal(
                aItems,
                orderLimit
              );
            }

            // Update model and UI
            oModel.setProperty("/totalSrvSheetVal", totalSrvSheetVal);
            this.byId("idServiceEntryTotalPrice").setText(
              `Total Service Sheet Value: ${totalSrvSheetVal.toFixed(2)}`
            );
          } catch (e) {
            MessageBox.error(e.message);
            console.error("Calculation error:", e);
          }
        },

        _calculatePlannedTotal: function (aItems) {
          return aItems.reduce((total, item) => {
            const srvQtyInput = Number(item.SERVICE_QUANTITY_INPUT) || 0;
            const srvcdQtyInput = Number(item.SERVICE_QUANTITY) || 0;
            const unitPrice = Number(item.UNIT_PRICE);
            const orderedQty = Number(item.ORDERED_QUANTITY) || 0;

            // Calculate total quantity
            const totalQuantity = srvQtyInput + srvcdQtyInput;

            // Validate remaining quantity
            const remainingQty = orderedQty - totalQuantity;

            if (remainingQty < 0) {
              throw new Error(
                `Item ${item.ITEM_NUMBER}: Service quantity exceeds remaining ordered quantity`
              );
            }

            // Calculate line total
            const lineTotal = unitPrice * srvQtyInput;
            // item.TOTAL_PRICE = lineTotal;

            return total + lineTotal;
          }, 0);
        },

        _calculateUnplannedTotal: function (aItems, orderLimit) {
          const itemsTotal = aItems.reduce((total, item) => {
            const srvQtyInput = Number(item.SERVICE_QUANTITY) || 0;
            const unitPrice = Number(item.UNIT_PRICE);

            // Validate inputs
            if (unitPrice < 0) {
              throw new Error(
                `Item ${item.ITEM_NUMBER}: Unit price cannot be negative`
              );
            }

            if (srvQtyInput < 0) {
              throw new Error(
                `Item ${item.ITEM_NUMBER}: Service quantity cannot be negative`
              );
            }

            // Calculate line total
            const lineTotal = unitPrice * srvQtyInput;
            item.TOTAL_PRICE = lineTotal;

            return total + lineTotal;
          }, 0);

          if (itemsTotal > orderLimit) {
            throw new Error(
              `Total Service Sheet value ${itemsTotal} cannot exceed the order amount ${orderLimit}`
            );
            return;
          }

          return itemsTotal;
        },

        _validateInputFormat: function (oInput, value) {
          if (value === "") return true;
          if (isNaN(value) || value.trim() === "") {
            this._setInputErrorState(oInput, "Please enter a valid number");
            oInput.setValue("");
            return false;
          }
          if (Number(value) < 0) {
            this._setInputErrorState(oInput, "Value cannot be negative");
            return false;
          }
          return true;
        },

        _setInputErrorState: function (oInput, message) {
          oInput.setValueState(sap.ui.core.ValueState.Error);
          oInput.setValueStateText(message);
          oInput.focus();
        },

        // Add new row for unplanned services
        onAddPress: function () {
          const oModel = this.getView().getModel("srvEntryModel");
          const aItems = oModel.getProperty("/to_Items/results") || [];
          const lastSRNo =
            aItems.length > 0
              ? Math.max(...aItems.map((item) => item.SR_NO))
              : 0;

          const newItem = {
            SR_NO: lastSRNo + 10,
            ITEM_NUMBER: lastSRNo + 1,
            SERVICE_NUMBER: "",
            SERVICE_DESCRIPTION: "",
            ORDERED_QUANTITY: "",
            UNIT_OF_MEASURE: "",
            UNIT_PRICE: "",
            SERVICE_QUANTITY: 1,
            TOTAL_PRICE: "",
          };

          aItems.push(newItem);
          oModel.setProperty("/to_Items/results", aItems);

          // Validate the new row
          this._validateNewRow(newItem);
        },

        // Validate a newly added row
        _validateNewRow: function (oItem) {
          const oModel = this.getView().getModel("srvEntryModel");
          const orderLimit = Number(oModel.getProperty("/AMOUNT")) || 0;

          // Set default values if empty
          if (!oItem.UNIT_PRICE) oItem.UNIT_PRICE = "0";
          if (!oItem.SERVICE_QUANTITY) oItem.SERVICE_QUANTITY = "1";

          // Calculate initial total
          const unitPrice = Number(oItem.UNIT_PRICE) || 0;
          const quantity = Number(oItem.SERVICE_QUANTITY) || 0;
          oItem.TOTAL_PRICE = (unitPrice * quantity).toFixed(2);

          // Update the grand total
          this._updateTotalPrice();
        },

        // Delete selected rows
        onDeletePress: function (oEvent) {
          const oTable = this.byId("serviceEntryProductsTable");
          const aSelectedItems = oTable.getSelectedItems();

          if (aSelectedItems.length === 0) {
            return; // Silently return if no items selected
          }

          this._deleteSelectedItems(aSelectedItems);
        },

        _deleteSelectedItems: function (aSelectedItems) {
          const oModel = this.getView().getModel("srvEntryModel");
          const aItems = oModel.getProperty("/to_Items/results") || [];

          // Get indexes of selected items (working backwards to avoid index shifting)
          const aIndexes = aSelectedItems
            .map((item) => {
              return aItems.findIndex(
                (i) =>
                  i.SR_NO ===
                  item.getBindingContext("srvEntryModel").getObject().SR_NO
              );
            })
            .sort((a, b) => b - a); // Sort descending

          // Remove items
          aIndexes.forEach((index) => {
            if (index > -1) {
              aItems.splice(index, 1);
            }
          });

          oModel.setProperty("/to_Items/results", aItems);
          this._updateTotalPrice();

          // Clear selection after deletion
          this.byId("serviceEntryProductsTable").removeSelections();
        },

        onServiceNumberValueHelp: function (oEvent) {
          const oView = this.getView();
          const oSource = oEvent.getSource();

          // Store current binding context
          this._sCurrentSelectedPath = oSource
            .getBindingContext("srvEntryModel")
            .getPath();
          this._oBasicSearchField = new sap.m.SearchField();

          // Set busy state
          oView.byId("idServiceEntryObjectPage").setBusy(true);

          // Load value help dialog fragment
          Fragment.load({
            id: oView.getId(),
            name: "com.aisp.aispsupplierportal.view.SrvValHelp",
            controller: this,
          })
            .then(
              function (oDialog) {
                this._setupValueHelpDialog(oDialog);
                oView.byId("idServiceEntryObjectPage").setBusy(false);
                oDialog.open();
              }.bind(this)
            )
            .catch(function (err) {
              oView.byId("idServiceEntryObjectPage").setBusy(false);
              console.error("Error loading ValueHelpDialog:", err);
              MessageBox.error("Failed to load service number selection");
            });
        },

        _setupValueHelpDialog: function (oDialog) {
          this._oVHD = oDialog;
          this.getView().addDependent(oDialog);

          // Configure dialog basics
          oDialog.setKeys(["UnitOfMesure"]);

          // Set up filter bar
          const oFilterBar = oDialog.getFilterBar();
          oFilterBar.setFilterBarExpanded(false);
          oFilterBar.setBasicSearch(this._oBasicSearchField);
          this._oBasicSearchField.attachSearch(() => oFilterBar.search());

          // Configure dialog table
          oDialog.getTableAsync().then(
            function (oTable) {
              oTable.setModel(this.oProductsModel);

              if (oTable.bindRows) {
                // Desktop table
                this._setupDesktopTable(oTable);
              } else if (oTable.bindItems) {
                // Mobile table
                this._setupMobileTable(oTable);
              }

              oDialog.update();
            }.bind(this)
          );
        },

        _setupDesktopTable: function (oTable) {
          // Bind data
          oTable.bindAggregation("rows", {
            path: "/ZI_AISP_ServicesVH",
            mode: "None",
            events: { dataReceived: () => this._oVHD.update() },
          });

          // Add columns
          const aColumns = [
            {
              id: "colServiceNumber",
              label: "Service Number",
              template: new sap.m.Text({ text: "{ServiceNumber}" }),
              fieldName: "ServiceText",
            },
            {
              id: "colUnitOfMeasure",
              label: "Unit Of Measure",
              template: new sap.m.Text({ text: "{UnitOfMesure}" }),
              fieldName: "UnitOfMesure",
            },
            {
              id: "colServiceText",
              label: "Service Description",
              template: new sap.m.Text({ text: "{ServiceText}" }),
              fieldName: "ServiceNumber",
            },
          ];

          aColumns.forEach((col) => {
            const oColumn = new sap.ui.table.Column({
              label: new sap.m.Label({ text: col.label }),
              template: col.template,
            });
            oColumn.data({ fieldName: col.fieldName });
            oTable.addColumn(oColumn);
          });
        },

        _setupMobileTable: function (oTable) {
          // Bind data
          oTable.bindAggregation("items", {
            path: "/ZI_AISP_ServicesVH",
            template: new sap.m.ColumnListItem({
              cells: [
                new sap.m.Label({ text: "{ServiceNumber}" }),
                new sap.m.Label({ text: "{ServiceText}" }),
                new sap.m.Label({ text: "{UnitOfMesure}" }),
              ],
            }),
            events: { dataReceived: () => this._oVHD.update() },
          });

          // Add columns
          ["Service Number", "Service Description", "Unit Of Measure"].forEach(
            (headerText) => {
              oTable.addColumn(
                new sap.m.MColumn({
                  header: new sap.m.Label({ text: headerText }),
                })
              );
            }
          );
        },

        onFilterBarSearch: function (oEvent) {
          const oFilterBar = Fragment.byId(this.getView().getId(), "filterBar");
          const oTable = Fragment.byId(
            this.getView().getId(),
            "valueHelpTable"
          );
          const aFilters = [];

          // Get filter values
          const sServiceNumber = oFilterBar.getFilterData().ServiceNumber;
          const sServiceText = oFilterBar.getFilterData().ServiceText;

          // Create filters
          if (sServiceNumber) {
            aFilters.push(
              new Filter(
                "ServiceNumber",
                FilterOperator.Contains,
                sServiceNumber
              )
            );
          }
          if (sServiceText) {
            aFilters.push(
              new Filter("ServiceText", FilterOperator.Contains, sServiceText)
            );
          }

          // Apply filters
          const oBinding = oTable.getBinding("rows");
          if (aFilters.length > 0) {
            oBinding.filter(new Filter(aFilters, true));
          } else {
            oBinding.filter([]);
          }
        },

        onValueHelpOkPress: function (oEvent) {
          const aTokens = oEvent.getParameters().tokens;

          if (aTokens.length > 1) {
            MessageBox.alert(
              "Please select only one service number to proceed."
            );
            return;
          }

          if (aTokens.length === 0) {
            MessageBox.alert("Please select a service number.");
            return;
          }

          const oSelectedItem = aTokens[0].data().row;
          const oModel = this.getView().getModel("srvEntryModel");

          debugger;

          // Update model with selected values
          oModel.setProperty(
            `${this._sCurrentSelectedPath}/SERVICE_NUMBER`,
            oSelectedItem.ServiceNumber
          );
          oModel.setProperty(
            `${this._sCurrentSelectedPath}/SERVICE_DESCRIPTION`,
            oSelectedItem.ServiceText
          );
          oModel.setProperty(
            `${this._sCurrentSelectedPath}/UNIT_OF_MEASURE`,
            oSelectedItem.UnitOfMesure
          );

          this._oVHD.close();
          this._updateTotalPrice(); // Update total after changing service
        },

        onValueHelpCancelPress: function () {
          this._oVHD.close();
        },

        onValueHelpAfterClose: function () {
          if (this._oVHD) {
            this._oVHD.destroy();
            this._oVHD = null;
          }
          this._sCurrentSelectedPath = null;
        },

        onPressEdit: function () {
          const oViewStateModel = this.getView().getModel("viewStateModel");
          const oSrvEntryModel = this.getView().getModel("srvEntryModel");
          const aAttachments =
            oSrvEntryModel.getProperty("/to_Attachments/results") || [];

          oViewStateModel.setProperty("/isEditMode", true);
          oViewStateModel.setProperty(
            "/showUploader",
            aAttachments.length === 0
          );

          // Show save button, hide edit button
          this.byId("idEditBtn").setVisible(false);
          this.byId("idSaveBtn").setVisible(true);

          this._updateTableMode();
        },

        onPressCancel: function () {
          const oViewStateModel = this.getView().getModel("viewStateModel");
          const isEditMode = oViewStateModel.getProperty("/isEditMode");
          if (isEditMode) {
            oViewStateModel.setProperty("/isEditMode", false);
            this._updateTableMode();
            // Reload original data to cancel edits
            this._loadRequestData(this.REQ_NUMBER);
          } else {
            this.navigateBack();
          }
        },

        onSaveChanges: function () {
          try {
            const oPayload = this._prepareSavePayload();
            MessageBox.confirm("Are you sure you want to submit?", {
              title: "Confirm submission",
              onClose: (oAction) => {
                if (oAction === MessageBox.Action.OK) {
                  this._submitData(oPayload);
                }
              },
            });
          } catch (e) {
            MessageBox.error(e.message);
          }
        },

        _prepareSavePayload: function () {
          const oModel = this.getView().getModel("srvEntryModel");
          const oData = oModel.getData();
          const srvType = this.getView()
            .getModel("viewStateModel")
            .getProperty("/srvType");

          // Validate required fields
          if (!oData.SERVICE_PERIOD)
            throw new Error("Service Period is required");
          if (!oData.SERVICE_LOCATION)
            throw new Error("Service Location is required");
          if (!oData.PERSON_RESPONSIBLE)
            throw new Error("Person Responsible is required");

          // Validate items
          const { items: aServiceItems, grandTotal } =
            this._collectServiceItems();
          if (grandTotal <= 0)
            throw new Error("Total Service Sheet Value cannot be zero");

          // Validate attachments
          const aAttachments = oData.to_Attachments?.results || [];
          if (aAttachments.length === 0)
            throw new Error("At least one attachment is required");

          return {
            action: "EDIT",
            TOTAL_AMOUNT: grandTotal,
            servicehead: [
              {
                REQUEST_NO: oData.REQUEST_NO,
                SERVICE_PERIOD: oData.SERVICE_PERIOD,
                SERVICE_LOCATION: oData.SERVICE_LOCATION,
                PERSON_RESPONSIBLE: oData.PERSON_RESPONSIBLE,
                COMPANY_CODE: oData.COMPANY_CODE || "",
                PO_NUMBER: this.PO_NUMBER,
                AMOUNT: oData.AMOUNT || "",
                TYPE: srvType,
                COMMENT: "Revised and re-uploaded",
                SUPPLIER_NUMBER: oData.Lifnr,
                SUPPLIER_NAME: oData.LIFNR_NAME,
              },
            ],
            serviceitem: aServiceItems,
            attachments: aAttachments.map((a) => ({
              URL: a.URL,
              DESCRIPTION: a.DESCRIPTION || a.IMAGE_FILE_NAME,
              COMMENT: a.COMMENT || "",
            })),
          };
        },

        _collectServiceItems: function () {
          const oModel = this.getView().getModel("srvEntryModel");
          const aSrvItemRows = oModel.getProperty("/to_Items/results") || [];
          const srvType = this.getView()
            .getModel("viewStateModel")
            .getProperty("/srvType");
          const aCleanItems = [];
          let grandTotal = 0;

          if (aSrvItemRows.length === 0) {
            throw new Error("At least one Service Item must be present");
          }

          aSrvItemRows.forEach((rowItem) => {
            const iUnitPrice = Number(rowItem.UNIT_PRICE || 0);
            const iServiceQty = Number(
              srvType === "Planned"
                ? rowItem.SERVICE_QUANTITY_INPUT || 0
                : rowItem.SERVICE_QUANTITY || 0
            );

            // Validation
            if (iUnitPrice < 0)
              throw new Error(
                `Row ${rowItem.SR_NO}: Unit Price cannot be negative`
              );
            if (iServiceQty < 0)
              throw new Error(
                `Row ${rowItem.SR_NO}: Service Quantity must be positive`
              );

            if (srvType === "Planned") {
              const iOrderedQty = Number(rowItem.ORDERED_QUANTITY || 0);
              const iServicedQty = Number(rowItem.SERVICE_QUANTITY || 0);
              const remainingQty = iOrderedQty - iServicedQty;

              if (iServiceQty > remainingQty) {
                throw new Error(
                  `Row ${rowItem.SR_NO}: Service Quantity (${iServiceQty}) exceeds ` +
                    `remaining quantity (${remainingQty})`
                );
              }
            }

            const lineTotal = iUnitPrice * iServiceQty;
            grandTotal += lineTotal;

            aCleanItems.push({
              SR_NO: String(rowItem.SR_NO),
              SERVICE_NUMBER: String(rowItem.SERVICE_NUMBER),
              SERVICE_DESCRIPTION: rowItem.SERVICE_DESCRIPTION,
              ORDERED_QUANTITY: rowItem.ORDERED_QUANTITY,
              UNIT_OF_MEASURE: rowItem.UNIT_OF_MEASURE,
              UNIT_PRICE: iUnitPrice,
              SERVICE_QUANTITY:
                srvType === "Planned"
                  ? iServiceQty + Number(rowItem.SERVICE_QUANTITY || 0)
                  : iServiceQty,
              TOTAL_PRICE: lineTotal,
              ITEM_NUMBER: String(rowItem.ITEM_NUMBER),
            });
          });

          return {
            items: aCleanItems,
            grandTotal: Number(grandTotal.toFixed(2)),
          };
        },

        _submitData: function (oPayload) {
          const oView = this.getView();
          oView.setBusy(true);

          this.getView()
            .getModel()
            .create("/submitSES", oPayload, {
              method: "POST",
              success: (oData) => {
                oView.setBusy(false);
                const sMessage =
                  oData.submitSES?.returnMessage ||
                  "Your Service Entry Sheet has been submitted successfully!";

                MessageBox.success(sMessage, {
                  title: "Success",
                  onClose: () => {
                    // Refresh data after successful submission
                    this._loadRequestData(this.REQ_NUMBER);
                    this.getView()
                      .getModel("viewStateModel")
                      .setProperty("/isEditMode", false);
                    this.byId("idSaveBtn").setVisible(false);
                    this.byId("idEditBtn").setVisible(true);
                  },
                });
              },
              error: (oErr) => {
                oView.setBusy(false);
                const sMsg = oErr?.message
                  ? JSON.parse(oErr?.message).error.message.value
                  : "Submission failed";
                MessageBox.error(sMsg);
              },
            });
        },

        onPreviewAttachment: function (oEvent) {
          debugger;
          const oContext = oEvent
            .getSource()
            .getBindingContext("srvEntryModel");
          const oData = oContext.getObject();
          const oSplitterLayout = this.byId("previewServicePageSplitterLayout");
          const iframe = document.getElementById("pdfFrame");

          if (oData.URL) {
            oSplitterLayout.setSize("35%");
            iframe.src = oData.URL;
          } else {
            MessageToast.show("No attachment URL available");
          }
        },

        // Handle attachment deletion
        onDeleteAttachmentPress: function (oEvent) {
          const oSource = oEvent.getSource();
          const oBindingContext = oSource.getBindingContext("srvEntryModel");

          if (!oBindingContext) return;

          const sPath = oBindingContext.getPath();
          const iIndex = parseInt(sPath.split("/").pop(), 10);
          const oModel = this.getView().getModel("srvEntryModel");
          const aAttachments =
            oModel.getProperty("/to_Attachments/results") || [];

          if (iIndex > -1 && iIndex < aAttachments.length) {
            // Remove the attachment from the array
            aAttachments.splice(iIndex, 1);

            // Update the model
            oModel.setProperty("/to_Attachments/results", aAttachments);

            // Update the attachments count
            this._updateAttachmentsCount();

            // Show the uploader button if no attachments left
            if (aAttachments.length === 0) {
              this.getView()
                .getModel("viewStateModel")
                .setProperty("/showUploader", true);
            }
          }
        },

        onFileSelected: function (oEvent) {
          debugger;
          const oUploader = oEvent.getSource();
          const aFiles = oEvent.getParameter("files") || [];

          let oSrvEntryModel = this.getView().getModel("srvEntryModel");
          let oData = oSrvEntryModel.getData();

          // Return early if no files selected
          if (!aFiles.length) return;

          const oFile = aFiles[0];
          const MAX_SIZE = 1 * 1024 * 1024; // 1 MB limit

          // Validate file size
          if (oFile.size > MAX_SIZE) {
            MessageBox.error("File size exceeds 1 MB limit.");
            return oUploader.clear();
          }

          // Validate file type
          const sFileType = oFile.type.toLowerCase();
          const aAllowedTypes = [
            "application/pdf",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv",
          ];

          if (!aAllowedTypes.some((type) => sFileType.includes(type))) {
            MessageBox.error("Only PDF, Excel, CSV or TXT files allowed.");
            return oUploader.clear();
          }

          const oModel = this.getView().getModel("srvEntryModel");
          const aAttachments =
            oModel.getProperty("/to_Attachments/results") || [];

          // Check single attachment limit
          if (aAttachments.length >= 1) {
            MessageBox.error(
              "Maximum one attachment allowed. Delete existing file first."
            );
            return oUploader.clear();
          }

          const oReader = new FileReader();

          oReader.onload = (e) => {
            const sBase64Data = e.target.result.split(",")[1]; // Get base64 payload

            // Create new attachment object
            const oNewAttachment = {
              REQUEST_NO: oData.REQUEST_NO,
              DESCRIPTION: oFile.name,
              base64value: sBase64Data,
              // IMAGE_FILE_NAME: oFile.name,
              // FILE_SIZE: this._formatFileSize(oFile.size),
              // UPLOADED_ON: new Date().toISOString(),
              COMMENT: "",
              URL: "", // Will be populated when saved
            };

            // Update model
            oModel.setProperty("/to_Attachments/results", [
              ...aAttachments,
              oNewAttachment,
            ]);

            // Update UI
            this.byId("attachmentsCountTitleSrvEntry").setText(
              `Attachments (${aAttachments.length + 1})`
            );
            oUploader.clear();

            // Hide uploader if in edit mode
            if (
              this.getView()
                .getModel("viewStateModel")
                .getProperty("/isEditMode")
            ) {
              this.getView()
                .getModel("viewStateModel")
                .setProperty("/showUploader", false);
            }
          };

          oReader.onerror = () => {
            MessageBox.error("Failed to read file.");
            oUploader.clear();
          };

          oReader.readAsDataURL(oFile);
        },

        _formatFileSize: function (bytes) {
          if (bytes === 0) return "0 Bytes";
          const k = 1024;
          const sizes = ["Bytes", "KB", "MB"];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return Number((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
        },

        _updateAttachmentsCount: function () {
          const oModel = this.getView().getModel("srvEntryModel");
          const aAttachments =
            oModel.getProperty("/to_Attachments/results") || [];
          this.byId("attachmentsCountTitleSrvEntry").setText(
            `Attachments (${aAttachments.length})`
          );
        },

        onFileSizeExceed: function () {
          MessageBox.error("File size exceeds the maximum limit of 2 MB.");
        },

        onClosePreview: function () {
          const oSplitterLayout = this.byId("previewServicePageSplitterLayout");
          oSplitterLayout.setSize("0%");

          const iframe = document.getElementById("pdfFrame");
          if (iframe) iframe.src = "";
        },

        navigateBack: function () {
          const oRouter = this.getOwnerComponent().getRouter();
          oRouter.navTo("RouteListReport");
        },

        _setBusy: function (bBusy) {
          this.getView().setBusy(bBusy);
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

        formatIsoToShortDate: function (date) {
          if (!date) return "";
          const oDate = date instanceof Date ? date : new Date(date);
          return sap.ui.core.format.DateFormat.getDateInstance({
            pattern: "MMM d, yyyy",
          }).format(oDate);
        },

        onExit: function () {
          // Clean up value help dialog if it exists
          if (this._oValueHelpDialog) {
            this._oValueHelpDialog.destroy();
            this._oValueHelpDialog = null;
          }

          // Remove view dependencies
          this.getView().removeAllDependents();

          // Clean up any other resources
          this._sCurrentSelectedPath = null;

          // Reset any models if needed
          const oViewStateModel = this.getView().getModel("viewStateModel");
          if (oViewStateModel) {
            oViewStateModel.setData(
              {
                isEditMode: false,
                srvType: "Un-planned",
                showUploader: false,
              },
              true
            );
          }

          this.byId("idServiceEntryTotalPrice").setText(
            "Total Service Sheet Value : 00"
          );
        },
      }
    );
  }
);

sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/ui/core/BusyIndicator",
  ],
  function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Fragment,
    BusyIndicator
  ) {
    "use strict";

    return Controller.extend(
      "com.invoiceappairdit.invoiceapprovalairdit.aispcustomerportal.controller.ObjDetails",
      {
        onInit: function () {
          this._initRouter();
          this._initModels();
        },

        _initRouter: function () {
          var oRouter = this.getOwnerComponent().getRouter();
          oRouter
            .getRoute("RouteObjDetailsPage")
            .attachPatternMatched(this.onPatternMatched, this);
        },

        _initModels: function () {
          // Set main model
          this.getView().setModel(this.getOwnerComponent().getModel());

          // View state model for busy indicator
          this.getView().setModel(
            new JSONModel({
              isBusy: false,
            }),
            "viewStateModel"
          );
        },

        onPatternMatched: function (oEvent) {
          this._setBusy(true);
          var reqNum = oEvent.getParameter("arguments").reqNo;
          this.getOwnerComponent()
            .getModel("appView")
            .setProperty("/layout", "OneColumn");

          this._loadRequestData(reqNum)
            .catch(function () {
              MessageToast.show("Failed to load request data");
            })
            .finally(
              function () {
                this._setBusy(false);
              }.bind(this)
            );
        },

        _loadRequestData: function (reqNum) {
          return new Promise(
            function (resolve, reject) {
              var oModel = this.getView().getModel();
              oModel.read("/SES_Head", {
                filters: [new Filter("REQUEST_NO", FilterOperator.EQ, reqNum)],
                success: function (res) {
                  this._processRequestData(res.results[0] || {});
                  resolve();
                }.bind(this),
                error: function (err) {
                  console.error("Error loading request data:", err);
                  reject(err);
                },
              });
            }.bind(this)
          );
        },

        _processRequestData: function (oResData) {
          // Set header data
          var oHeadModel = new JSONModel(oResData);
          this.getView().setModel(oHeadModel, "oResData");

          // Process items
          var items = (oResData.to_Items && oResData.to_Items.results) || [];
          var oItemsModel = new JSONModel({
            results: items,
            totalSrvSheetVal: this._calculateTotal(items),
          });
          this.getView().setModel(oItemsModel, "tableModel");

          // Process attachments
          var attachments =
            (oResData.to_Attachments && oResData.to_Attachments.results) || [];
          this.getView().setModel(
            new JSONModel({ attachments }),
            "attachmentsModel"
          );
        },

        _calculateTotal: function (items) {
          if (!items || !Array.isArray(items)) return 0;
          return items.reduce(function (sum, it) {
            var quantity = Number(it.SERVICE_QUANTITY) || 0;
            var price = Number(it.UNIT_PRICE) || 0;
            return sum + quantity * price;
          }, 0);
        },

        // Field validation handlers
        onChangeSESEntry: function (oEvent) {
          var oInput = oEvent.getSource();
          this._validateComboBox(oInput, "Final SES Entry is required");
        },

        onChangeSitePersonInp: function (oEvent) {
          var oInput = oEvent.getSource();
          this._validateInput(oInput, "Site Person is required");
        },

        onChangeSrvTextInp: function (oEvent) {
          var oInput = oEvent.getSource();
          this._validateInput(oInput, "Service Text is required");
        },

        _validateComboBox: function (oComboBox, sErrorText) {
          if (!oComboBox.getSelectedKey()) {
            oComboBox.setValueState("Error");
            oComboBox.setValueStateText(sErrorText);
          } else {
            oComboBox.setValueState("None");
          }
        },

        _validateInput: function (oInput, sErrorText) {
          if (!oInput.getValue()) {
            oInput.setValueState("Error");
            oInput.setValueStateText(sErrorText);
          } else {
            oInput.setValueState("None");
          }
        },

        _validateForm: function () {
          var oView = this.getView();
          var bIsValid = true;

          // Validate Final SES Entry
          var oFinalSESEntry = oView.byId("idFinalSESEntry");
          this._validateComboBox(oFinalSESEntry, "Final SES Entry is required");
          if (oFinalSESEntry.getValueState() === "Error") bIsValid = false;

          // Validate Site Person
          var oSitePerson = oView.byId("idSitePerson");
          this._validateInput(oSitePerson, "Site Person is required");
          if (oSitePerson.getValueState() === "Error") bIsValid = false;

          // Validate Service Text
          var oServiceText = oView.byId("idServiceText");
          this._validateInput(oServiceText, "Service Text is required");
          if (oServiceText.getValueState() === "Error") bIsValid = false;

          // Validate items
          var aServiceItems = oView.getModel("tableModel").getData().results;
          if (!aServiceItems || aServiceItems.length === 0) {
            MessageToast.show("No items present");
            bIsValid = false;
          }

          return bIsValid;
        },

        onPressApprove: function () {
          if (!this._validateForm()) return;

          if (!this._pApproveCommentDialog) {
            this._pApproveCommentDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.invoiceappairdit.invoiceapprovalairdit.aispcustomerportal.fragments.ApproveComment",
              controller: this,
            }).then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this)
            );
          }

          this._pApproveCommentDialog.then(
            function (oDialog) {
              this.byId("approveCommentTextArea").setValue("");
              this.byId("approveCharCounter").setText("0 / 500");
              oDialog.open();
            }.bind(this)
          );
        },

        onApproveCommentLiveChange: function (oEvent) {
          const sValue = oEvent.getParameter("value") || "";
          this.byId("approveCharCounter").setText(`${sValue.length} / 500`);
        },

        onApproveCommentCancel: function () {
          this.byId("approveCommentDialog").close();
        },

        onApproveCommentSubmit: function () {
          var sComment = this.byId("approveCommentTextArea").getValue().trim();

          if (!sComment) {
            MessageBox.warning("Approval comment is required.");
            return;
          }

          this.byId("approveCommentDialog").close();
          this._submitAction("APPROVE", sComment);
        },

        onPressReject: function () {
          if (!this._validateForm()) return;

          if (!this._oRejectDialog) {
            this._oRejectDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.invoiceappairdit.invoiceapprovalairdit.aispcustomerportal.fragments.RejectionDialog",
              controller: this,
            }).then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this)
            );
          }

          this._oRejectDialog.then(
            function (oDialog) {
              oDialog.open();
            }.bind(this)
          );
        },

        onRejectDialogClose: function () {
          let rejectionCommentElement = this.getView().byId("rejectionComment");
          if (this._oRejectDialog) {
            this._oRejectDialog.then(function (oDialog) {
              rejectionCommentElement.setValue("");
              oDialog.close();
            });
          }
        },

        onConfirmReject: function () {
          var sComment = this.byId("rejectionComment").getValue().trim();

          if (!sComment) {
            MessageBox.warning("Please enter a rejection comment.");
            return;
          }

          // Close the dialog before proceeding
          if (this._oRejectDialog) {
            this._oRejectDialog.then(
              function (oDialog) {
                oDialog.close();
              }.bind(this)
            );
          }

          this._submitAction("REJECT", sComment);
        },

        _submitAction: function (sAction, sComment) {
          this._setBusy(true);

          var oPayload = this._preparePayload(sAction, sComment);
          var oModel = this.getView().getModel();

          oModel.create("/submitSES", oPayload, {
            method: "POST",
            success: function (oRes) {
              this._handleSubmissionSuccess(oRes);
            }.bind(this),
            error: function (oErr) {
              this._handleSubmissionError(oErr);
            }.bind(this),
          });
        },

        _preparePayload: function (sAction, sComment) {
          var oView = this.getView();
          var oHeadModel = oView.getModel("oResData");
          var oItemsModel = oView.getModel("tableModel");
          var oAttachmentModel = oView.getModel("attachmentsModel");

          return {
            action: sAction,
            TOTAL_AMOUNT: oItemsModel.getData().totalSrvSheetVal,
            servicehead: [
              {
                REQUEST_NO: oHeadModel.getProperty("/REQUEST_NO"),
                COMMENT: sComment,
                FINAL_SES_ENTRY: oView.byId("idFinalSESEntry").getSelectedKey(),
                SITE_PERSON: oView.byId("idSitePerson").getValue(),
                SERVICE_TEXT: oView.byId("idServiceText").getValue(),
              },
            ],
            serviceitem: this._cleanItems(oItemsModel.getData().results),
            attachments: this._cleanItems(
              oAttachmentModel.getData().attachments
            ),
          };
        },

        _cleanItems: function (aItems) {
          return (aItems || []).map(function (item) {
            var cleanedItem = {};
            for (var prop in item) {
              if (prop !== "__metadata" && prop !== "_id") {
                cleanedItem[prop] = item[prop];
              }
            }
            return cleanedItem;
          });
        },

        _handleSubmissionSuccess: function (oRes) {
          this._setBusy(false);

          MessageBox.success(
            oRes.submitSES?.returnMessage || "Action completed successfully!",
            {
              title: "Success",
              onClose: function () {
                this.resetForm();
                this.getOwnerComponent().getRouter().navTo("RouteListReport");
              }.bind(this),
            }
          );
        },

        _handleSubmissionError: function (oErr) {
          this._setBusy(false);

          var sMsg = "Submission failed. Please try again.";
          if (oErr.responseText) {
            try {
              sMsg = JSON.parse(oErr.responseText).error.message.value || sMsg;
            } catch (e) {
              console.error("Error parsing error response:", e);
            }
          }

          MessageBox.error(sMsg);
        },

        resetForm: function () {
          var oView = this.getView();

          // Reset form fields
          oView.byId("idFinalSESEntry").setSelectedKey(null);
          oView.byId("idSitePerson").setValue("");
          oView.byId("idServiceText").setValue("");

          // Clear any validation errors
          oView.byId("idFinalSESEntry").setValueState("None");
          oView.byId("idSitePerson").setValueState("None");
          oView.byId("idServiceText").setValueState("None");
        },

        _setBusy: function (bBusy) {
          this.getView()
            .getModel("viewStateModel")
            .setProperty("/isBusy", bBusy);
          if (bBusy) {
            BusyIndicator.show(0);
          } else {
            BusyIndicator.hide();
          }
        },

        handleClose: function () {
          this.resetForm();
          this.getOwnerComponent().getRouter().navTo("RouteListReport");
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

        onPreviewPdf: function (oEvent) {
          var sImageUrl = oEvent.getSource().data("imageUrl");
          if (!sImageUrl) {
            MessageToast.show("No file URL available.");
            return;
          }

          this.getOwnerComponent()
            .getModel("appView")
            .setProperty("/layout", "TwoColumnsBeginExpanded");
          this.getOwnerComponent()
            .getRouter()
            .navTo("Invoicepdf", {
              imageUrl: encodeURIComponent(sImageUrl),
            });
        },

        onPressLogs: function (oEvent) {
          const oModel = this.getView().getModel();
          const oHeaderModel = this.getView().getModel("oResData");
          const oHeaderData = oHeaderModel.getData();
          let PO_NUMBER = oHeaderData.PO_NUMBER;

          if (!PO_NUMBER) {
            MessageToast.show("No PO Number available.");
            return;
          }

          this.getOwnerComponent()
            .getModel("appView")
            .setProperty("/layout", "TwoColumnsBeginExpanded");

          this.getOwnerComponent().getRouter().navTo("Invoicepdf", {
            imageUrl: PO_NUMBER,
          });
        },
      }
    );
  }
);

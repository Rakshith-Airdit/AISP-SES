sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
  ],
  function (Controller, JSONModel, Filter, FilterOperator) {
    "use strict";

    return Controller.extend(
      "com.invoiceappairdit.invoiceapprovalairdit.aispcustomerportal.controller.Invoicepdf",
      {
        onInit: function () {
          const oRouter = this.getOwnerComponent().getRouter();
          this.getView().setModel(
            new JSONModel({ showPdf: false, showLogs: false }),
            "viewModel"
          );

          oRouter
            .getRoute("Invoicepdf")
            .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
          const args = oEvent.getParameter("arguments").imageUrl || "";

          // Check if the imageUrl looks like a URL (simple check)
          if (this._isValidUrl(args)) {
            // If it's a valid URL, call the function to show PDF
            this._onPdfMatched(args);
          } else {
            // Otherwise, treat it as a PO_NUMBER and show logs
            this._onLogsMatched(args);
          }
        },

        // Function to check if the string is a valid URL using regex
        _isValidUrl: function (str) {
          // Decode the URL first
          const decodedStr = decodeURIComponent(str);

          // A simple check for URLs (containing http or https)
          const regex = /^(https?:\/\/)?([\w\d\-]+\.)+[a-z]{2,}\/?/;
          return regex.test(decodedStr);
        },

        _onPdfMatched: function (encodedUrl) {
          //   const encodedUrl = oEvent.getParameter("arguments").imageUrl || "";
          const imageUrl = decodeURIComponent(encodedUrl);

          this.getView()
            .getModel("viewModel")
            .setData({ showPdf: true, showLogs: false });

          setTimeout(() => {
            const iframe = document.getElementById("pdfFrame");
            if (iframe) {
              iframe.src = imageUrl;
            }
          }, 0);
        },

        _onLogsMatched: function (poNumber) {
          
          const oModel = this.getView().getModel();
          const viewModel = this.getView().getModel("viewModel");
          const PO_NUMBER = poNumber || "";
          viewModel.setData({ showPdf: false, showLogs: true });

          const oLogsModel = this.getView().setModel(
            new JSONModel({logs:{}}),
            "logsModel"
          );

          const parseTimestamp = (raw) => {
            if (typeof raw === "string") {
              if (raw.includes("/Date(")) {
                return new Date(
                  parseInt(raw.replace("/Date(", "").replace(")/", ""))
                );
              }
              return new Date(raw);
            }
            if (typeof raw === "number") return new Date(raw);
            if (raw instanceof Date) return raw;
            return new Date();
          };

          const formatTimestamp = (date) => {
            // Format as "DD/MM/YYYY, HH:MM AM/PM"
            const options = {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            };
            return date.toLocaleString("en-GB", options).replace(",", "");
          };

          const getStatus = (action) => {
            switch (action) {
              case "CREATE":
                return "Information";
              case "APPROVE":
                return "Success";
              case "SEND_BACK":
                return "Warning";
              case "REJECT":
                return "Error";
              case "EDIT_RESUBMIT":
                return "Information";
              default:
                return "None";
            }
          };

          const getIcon = (action) => {
            switch (action) {
              case "CREATE":
                return "sap-icon://create";
              case "APPROVE":
                return "sap-icon://accept";
              case "SEND_BACK":
                return "sap-icon://undo";
              case "REJECT":
                return "sap-icon://decline";
              case "EDIT_RESUBMIT":
                return "sap-icon://edit";
              default:
                return "sap-icon://activity-items";
            }
          };

          oModel.read("/SES_CREATION_LOGS", {
            filters: [new sap.ui.model.Filter("PO_NUMBER", "EQ", PO_NUMBER)],

            success: function (oData) {
              
              const aLogs = oData.results || [];

              if (!aLogs.length) {
                sap.m.MessageToast.show("No approval logs found.");
                oGraphModel.setProperty("/logs", []);
                return;
              }

              // Sort logs by timestamp
              // aLogs.sort(
              //   (a, b) =>
              //     parseTimestamp(a.TIMESTAMP) - parseTimestamp(b.TIMESTAMP)
              // );

              const logs = aLogs.map((log) => {
                const timestamp = parseTimestamp(log.TIMESTAMP);
                return {
                  timestamp: formatTimestamp(timestamp), // For display
                  rawTimestamp: timestamp.toISOString(), // For binding
                  action: log.ACTION,
                  approver: log.APPROVER_ID,
                  role: log.APPROVER_ROLE || "N/A",
                  comment: log.COMMENT || "No comment provided",
                  level: log.APPROVAL_LEVEL,
                  status: getStatus(log.ACTION),
                  icon: getIcon(log.ACTION),
                };
              });

              oLogsModel.setProperty("/logs", logs);
              console.log("Timeline logs:", JSON.stringify(logs, null, 2));
            }.bind(this),
            error: function (err) {
              
              sap.m.MessageToast.show("Error fetching logs.");
              oLogsModel.setProperty("/logs", []);
            }.bind(this),
          });
        },

        onClosePreview: function () {
          history.go(-1);
        },
      }
    );
  }
);

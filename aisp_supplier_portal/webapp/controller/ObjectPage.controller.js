sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (Controller, MessageBox, MessageToast, Fragment) {
    "use strict";

    return Controller.extend("com.aisp.aispsupplierportal.controller.ObjectPage", {
        // Initialize controller
        onInit: function () {
            this._initModels();
            this._setupRouter();
            this._setupUI();
        },

        // Initialize models
        _initModels: function () {
            this.getView().setModel(
                new sap.ui.model.json.JSONModel({ attachments: [] }),
                "attachmentsModel"
            );
        },

        // Setup router
        _setupRouter: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("RouteObjectPage")
                .attachPatternMatched(this.onPatternMatched, this);
        },

        // Setup initial UI state
        _setupUI: function () {
            this.getView().byId("idObjectPage").setShowFooter(true);
            this._resetFormFields();
        },

        // Reset form fields
        _resetFormFields: function () {
            const view = this.getView();
            view.byId("idServicePeriod").setDateValue(null);
            view.byId("idServicePeriod").setSecondDateValue(null);
            view.byId("idServiceLocation").setValue("");
            view.byId("idPersonResponsible").setValue("");
        },

        // Format status state
        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "Pending": return "Indication13";
                case "Partial": return "Indication17";
                default: return "None";
            }
        },

        // Handle route pattern matched
        onPatternMatched: function (oEvent) {
            const { poNo, srvType } = oEvent.getParameter("arguments");
            this.poNo = poNo;
            this.srvType = srvType;

            this._resetFormFields();
            this._loadInitialData(poNo)
                .then(() => this._setupServiceItems())
                .then(() => this._updateInitialTotalPrice())
                .catch(error => this._handleDataLoadError(error));
        },

        // Load initial data
        _loadInitialData: function (poNo) {
            return Promise.all([
                this._oModelRead("SESHeaderList", poNo),
                this._oModelRead("SESItemList", poNo)
            ]);
        },

        // Handle model read
        _oModelRead: function (entity, poNo) {
            return new Promise((resolve, reject) => {

                const oModel = this.getView().getModel();

                this.getView().byId("idObjectPage").setBusy(true);

                const filterCondition = entity === "SESHeaderList"
                    ? new sap.ui.model.Filter("Ebeln", "EQ", poNo)
                    : new sap.ui.model.Filter("PO_NUMBER", "EQ", poNo);

                oModel.read(`/${entity}`, {
                    filters: [filterCondition],
                    success: (res) => {
                        this.getView().byId("idObjectPage").setBusy(false);
                        const modelName = entity === "SESHeaderList" ? "poModel" : "poDetailModel";
                        const poModel = new sap.ui.model.json.JSONModel(res.results);
                        this.getView().setModel(poModel, modelName);
                        resolve();
                    },
                    error: (error) => {
                        this.getView().byId("idObjectPage").setBusy(false);
                        const errorMsg = JSON.parse(error.responseText).error.message.value;
                        MessageBox.error(errorMsg);
                        console.error(errorMsg);
                        reject(error);
                    }
                });
            });
        },

        // Setup service items based on type
        _setupServiceItems: function () {
            this.getView().byId("idTotalPrice").setText("Total Service Sheet Value : 00");

            const selectedItemsModel = this.getOwnerComponent().getModel("selItemModel");
            const selectedData = JSON.parse(localStorage.getItem("selectedItems") || "{}");

            if (this.srvType === "Un-planned") {
                this._setupUnplannedItems(selectedData);
            } else if (this.srvType === "Planned" && selectedData) {
                this._setupPlannedItems(selectedData);
            } else {
                MessageBox.error("No items selected in multi page.");
            }
        },

        // Setup unplanned items
        _setupUnplannedItems: function (selectedData) {
            const previousTotal = this._calculatePreviousTotal(selectedData);
            this._previousTotalSrvValue = previousTotal;

            const oModel = new sap.ui.model.json.JSONModel({
                srvType: this.srvType,
                items: []
            });
            this.getView().setModel(oModel, "selItemModel");
            this.loadFragment(this.srvType);
        },

        // Setup planned items
        _setupPlannedItems: function (selectedData) {
            const oModel = new sap.ui.model.json.JSONModel({
                srvType: this.srvType,
                items: selectedData.items
            });
            this.getView().setModel(oModel, "selItemModel");
            this.loadFragment(this.srvType);
        },

        // Calculate previous total for unplanned items
        _calculatePreviousTotal: function (selectedData) {
            if (!selectedData || !selectedData.items) return 0;
            return selectedData.items.reduce((acc, item) => {
                const qty = Number(item.SERVICE_QUANTITY) || 0;
                const price = Number(item.UNIT_PRICE) || 0;
                return acc + qty * price;
            }, 0);
        },

        // Load appropriate fragment based on service type
        loadFragment: function (srvType) {
            const fragmentContainer = this.byId("fragmentContainer");
            fragmentContainer.removeAllItems();

            const fragmentType = srvType === "Planned" ? "PlannedFragment" : "UnplannedFragment";
            const fragmentVar = `_o${fragmentType}`;

            if (!this[fragmentVar]) {
                this[fragmentVar] = sap.ui.xmlfragment(
                    `com.aisp.aispsupplierportal.view.${fragmentType}`,
                    this
                );
                this.getView().addDependent(this[fragmentVar]);
            }

            fragmentContainer.addItem(this[fragmentVar]);
        },

        // Update initial total price
        _updateInitialTotalPrice: function () {
            try {
                // Safely get the models
                const oSelItemModel = this.getView().getModel("selItemModel");
                const oPoModel = this.getView().getModel("poModel");

                // Check if models exist
                if (!oSelItemModel || !oPoModel) {
                    console.warn("Models not yet initialized");
                    return;
                }

                // Safely get the data
                const aItems = oSelItemModel.getData().items || [];
                const poData = oPoModel.getData();

                // Check if we have PO data
                if (!poData || !poData[0]) {
                    console.warn("PO data not yet loaded");
                    return;
                }

                const orderLimit = Number(poData[0].Amount) || 0;
                let totalSrvSheetVal = 0;

                if (this.srvType === "Planned") {
                    aItems.forEach(item => {
                        const srvQtyInput = Number(item.newField) || 0;
                        const srvcdQtyInput = Number(item.SERVICE_QUANTITY) || 0;
                        // totalSrvSheetVal += Number(item.UNIT_PRICE || 0) * (srvQtyInput + srvcdQtyInput);
                        totalSrvSheetVal += Number(item.TOTAL_PRICE || 0);
                    });
                } else if (this.srvType === "Un-planned") {
                    aItems.forEach(item => {
                        const srvQtyInput = Number(item.SERVICE_QUANTITY) || 0;
                        const unitPrice = Number(item.UNIT_PRICE) || 0;
                        item.TOTAL_PRICE = unitPrice * srvQtyInput;
                        totalSrvSheetVal += item.TOTAL_PRICE;
                    });

                    totalSrvSheetVal += this._previousTotalSrvValue || 0;

                    if (totalSrvSheetVal > orderLimit) {
                        console.error(`Total Service Sheet value ${totalSrvSheetVal} exceeds order amount ${orderLimit}`);
                        // Don't throw here as it's just initial calculation
                    }
                }

                this.getView().byId("idTotalPrice").setText(`Total Service Sheet Value : ${totalSrvSheetVal}`);
            } catch (error) {
                console.error("Error in _updateInitialTotalPrice:", error);
                // Optionally set a default value or show error message
                this.getView().byId("idTotalPrice").setText("Total Service Sheet Value : 00");
            }
        },

        onInputChange: function (oEvent) {
            const oInput = oEvent.getSource();

            // First validate the input format
            if (!this._validateInputFormat(oInput)) {
                return;
            }

            const inputId = oInput.getId();
            const inputSource = inputId.slice(2, inputId.indexOf("-"));

            if (this.srvType === "Planned" && inputSource === "PlannedSrvQtyInput") {
                this._handlePlannedQuantityChange(oEvent);
            } else if (this.srvType === "Un-planned") {
                this._handleUnplannedInputChange(oEvent, inputSource);
            }
        },

        // Validate input format (numeric)
        _validateInputFormat: function (oInput) {
            const value = oInput.getValue();

            // Allow empty string (user might be deleting)
            if (value === "") {
                return true;
            }

            // Check if it's a valid number
            if (isNaN(value) || value.trim() === "") {
                this._setInputErrorState(oInput, "Please enter a valid number");
                oInput.setValue(""); // Clear invalid input
                return false;
            }

            return true;
        },

        // Handle planned quantity changes with enhanced validation
        _handlePlannedQuantityChange: function (oEvent) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("selItemModel");
            const oData = oContext.getObject();

            // Get and validate input value
            const inputValue = oInput.getValue();
            // Handle empty input case
            if (inputValue === "") {
                oData.newField = undefined;
                oData.hasValidQuantity = false; // Track validation state explicitly
                this._updateTotalPrice();
                return;
            }

            // Validate numeric input
            if (isNaN(inputValue)) {
                this._setInputErrorState(oInput, "Please enter a valid number");
                oInput.setValue(oData.newField || ""); // Revert to previous value
                return;
            }

            const serviceQuantity = Number(inputValue);
            const orderedQuantity = Number(oData.ORDERED_QUANTITY);
            const servicedQuantity = Number(oData.SERVICE_QUANTITY);

            // Validate against business rules
            if (serviceQuantity < 0) {
                this._setInputErrorState(oInput, "Service Quantity cannot be less than 0.");
                this._resetInputToPreviousValue(oInput, oData, "newField");
                return;
            }

            const remainingQuantity = orderedQuantity - servicedQuantity;
            if (serviceQuantity > remainingQuantity) {
                this._setInputErrorState(
                    oInput,
                    `Maximum allowed quantity is ${remainingQuantity}`
                );
                this._resetInputToPreviousValue(oInput, oData, "newField");
                return;
            } else {
                this._setInputErrorState(
                    oInput,
                    ""
                );
            }

            // If validation passes
            oInput.setValueState(sap.ui.core.ValueState.None);
            oData.newField = serviceQuantity;
            oData.hasValidQuantity = true;
            this._updateTotalPrice();
        },

        // Reset input to previous valid value
        _resetInputToPreviousValue: function (oInput, oData, property) {
            const previousValue = oData[property] || "";
            oInput.setValue(previousValue);
            oInput.setValueState(sap.ui.core.ValueState.Error);
        },

        // Handle unplanned input changes with enhanced validation
        _handleUnplannedInputChange: function (oEvent, inputSource) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("selItemModel");
            const oData = oContext.getObject();
            const poModel = this.getView().getModel("poModel")
            let orderLimit = Number(poModel.getData()[0]?.Bukrs || 0);

            // Get and validate input value
            const inputValue = oInput.getValue();
            if (inputValue === "") {
                return;
            }

            const value = Number(inputValue);
            const property = inputSource === "UnplannedSrvQtyInput" ? "SERVICE_QUANTITY" : "UNIT_PRICE";
            const prevValue = oData[property];

            if (value < 0) {
                const message = inputSource === "UnplannedSrvQtyInput"
                    ? "Service Quantity Cannot be negative"
                    : "Unit Price Cannot be negative";
                this._setInputErrorState(oInput, message);
                this._resetInputToPreviousValue(oInput, oData, property);
                return;
            }

            // Additional validation for Unplanned if needed
            if (inputSource === "UnplannedSrvQtyInput" && value > orderLimit) { // Example max limit
                this._setInputErrorState(oInput, `Maximum quantity is ${orderLimit}`);
                this._resetInputToPreviousValue(oInput, oData, property);
                return;
            }

            oData[property] = value;
            try {
                this._updateTotalPrice();
                oInput.setValueState(sap.ui.core.ValueState.None);
            } catch (e) {
                this._resetInputToPreviousValue(oInput, oData, property);
                this._setInputErrorState(oInput, e.message);
            }
        },

        // Set input error state
        _setInputErrorState: function (oInput, message) {
            oInput.setValueState(sap.ui.core.ValueState.Error);
            oInput.setValueStateText(message);
            oInput.focus(); // Bring focus back to the invalid field
        },

        // Update total price
        _updateTotalPrice: function () {
            const oModel = this.getView().getModel("selItemModel");
            const aItems = oModel.getProperty("/items");
            const orderLimit = Number(this.getView().getModel("poModel").getData()[0]?.Amount);
            let totalSrvSheetVal = 0;

            if (this.srvType === "Planned") {
                totalSrvSheetVal = this._calculatePlannedTotal(aItems);
            } else if (this.srvType === "Un-planned") {
                totalSrvSheetVal = this._calculateUnplannedTotal(aItems, orderLimit);
            }

            this.getView().byId("idTotalPrice").setText(`Total Service Sheet Value : ${totalSrvSheetVal}`);
        },

        // Calculate planned total
        _calculatePlannedTotal: function (aItems) {
            return aItems.reduce((total, item) => {
                if (item.newField === undefined || isNaN(item.newField)) {
                    return total + (Number(item.TOTAL_PRICE) || 0);
                }
                const srvQtyInput = Number(item.newField) || 0;
                const srvcdQtyInput = Number(item.SERVICE_QUANTITY) || 0;
                const unitPrice = Number(item.UNIT_PRICE);

                return total + (unitPrice * srvQtyInput);
                // return total + (unitPrice * (srvQtyInput + srvcdQtyInput));
            }, 0);
        },

        // Calculate unplanned total
        _calculateUnplannedTotal: function (aItems, orderLimit) {
            const itemsTotal = aItems.reduce((total, item) => {
                const srvQtyInput = Number(item.SERVICE_QUANTITY) || 0;
                const unitPrice = Number(item.UNIT_PRICE);
                item.TOTAL_PRICE = unitPrice * srvQtyInput;
                return total + item.TOTAL_PRICE;
            }, 0);

            const totalSrvSheetVal = itemsTotal + (this._previousTotalSrvValue || 0);

            if (totalSrvSheetVal > orderLimit) {
                throw new Error(
                    `Total Service Sheet value ${totalSrvSheetVal} cannot exceed the order amount ${orderLimit}.`
                );
            }

            return totalSrvSheetVal;
        },

        // Handle file selection for attachments
        onFileSelected: function (oEvent) {
            const aFiles = oEvent.getParameter("files");
            if (!aFiles || aFiles.length === 0) {
                MessageToast.show("No file selected!");
                return;
            }

            const oFile = aFiles[0];
            const maxFileSize = 2 * 1024 * 1024;

            if (oFile.size > maxFileSize) {
                MessageBox.error("File size exceeds the maximum limit of 2 MB.");
                this.byId("fileUploader").clear();
                return;
            }

            const oAttachmentsModel = this.getView().getModel("attachmentsModel");
            const aAttachments = oAttachmentsModel.getProperty("/attachments") || [];

            if (aAttachments.length >= 1) {
                MessageBox.alert("Only one attachment allowed. Please delete the existing file first.");
                this.byId("fileUploader").clear();
                return;
            }

            const oReader = new FileReader();
            oReader.onload = function (e) {
                const sBase64DataUrl = e.target.result.split(",")[1];
                const oNewAttachment = {
                    VendorCode: this.Lifnr,
                    DESCRIPTION: oFile.name,
                    IMAGEURL: sBase64DataUrl,
                    IMAGE_FILE_NAME: oFile.name,
                    FILE_SIZE: oFile.size,
                    UPLOADED_BY: "Current User",
                    uploadedOn: new Date().toLocaleDateString(),
                    version: "1"
                };

                oAttachmentsModel.setProperty("/attachments", [...aAttachments, oNewAttachment]);
                this.byId("attachmentsCountTitle").setText(`Attachments (${aAttachments.length + 1})`);
                this.byId("fileUploader").clear();
            }.bind(this);

            oReader.readAsDataURL(oFile);
        },

        onPreviewAttachment: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("attachmentsModel");
            const oData = oContext.getObject();
            const pdfUrl = oData.IMAGEURL;

            if (pdfUrl) {
                this.previewAttachment(oData)
            } else {
                MessageToast.show("Unable to load PDF.");
            }
        },

        previewAttachment: function (res) {
            const fileName = res.IMAGE_FILE_NAME || "Preview";
            const fileType = fileName.split(".").pop().toLowerCase();

            try {
                const byteCharacters = atob(res.IMAGEURL); // base64 decode
                const byteNumbers = new Array(byteCharacters.length);

                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }

                const byteArray = new Uint8Array(byteNumbers);

                let mimeType;

                switch (fileType) {
                    case "pdf":
                        mimeType = "application/pdf";
                        break;

                    case "png":
                    case "jpg":
                    case "jpeg":
                        mimeType = `image/${fileType === "jpg" ? "jpeg" : fileType}`;
                        break;

                    case "xlsx":
                        mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                        break;

                    case "msg":
                        mimeType = "application/vnd.ms-outlook";
                        break;

                    default:
                        MessageBox.error("Unsupported file type.");
                        return;
                }

                const blob = new Blob([byteArray], { type: mimeType });
                const objectURL = URL.createObjectURL(blob);

                // Show in new tab for previewable types
                if (["pdf", "png", "jpg", "jpeg"].includes(fileType)) {
                    const oSplitterLayout = this.byId("previewSplitterLayout");
                    if (oSplitterLayout) {
                        oSplitterLayout.setSize("35%");
                    }

                    const iframe = document.getElementById("pdfFrame");
                    if (iframe) {
                        iframe.src = objectURL;
                    }
                } else {
                    // For other types like xlsx, msg, force download
                    const link = document.createElement("a");
                    link.href = objectURL;
                    link.download = fileName;
                    link.click();
                }

            } catch (err) {
                MessageBox.error("Failed to preview file.");
                console.error("Preview Error:", err);
            }
        },

        onFileSizeExceed: function () {
            MessageBox.error("File size exceeds the maximum limit of 2 MB.");
        },

        onClosePreview: function () {
            // 1. Collapse the right-hand Splitter pane
            const oSplitterLayout = this.byId("previewSplitterLayout");
            if (oSplitterLayout) {
                oSplitterLayout.setSize("0%");
            }

            // 2. Clear the iframe’s source so the PDF/file is released
            const iframe = document.getElementById("pdfFrame");
            if (iframe) {
                iframe.src = "";
            }
        },

        // Handle attachment deletion
        onDeleteAttachmentPress: function (oEvent) {
            const oBindingContext = oEvent.getSource().getBindingContext("attachmentsModel");
            if (!oBindingContext) return;

            const sPath = oBindingContext.getPath();
            const iIndex = parseInt(sPath.split("/").pop(), 10);

            const oAttachmentsModel = this.getView().getModel("attachmentsModel");
            const aAttachments = oAttachmentsModel.getProperty("/attachments") || [];

            if (iIndex > -1 && iIndex < aAttachments.length) {
                aAttachments.splice(iIndex, 1);
                oAttachmentsModel.setProperty("/attachments", aAttachments);
                this.byId("attachmentsCountTitle").setText(`Attachments (${aAttachments.length})`);
            }
        },

        // Handle form submission
        onPressSubmit: function () {
            if (!this._validateForm()) return;

            try {
                const { items: aServiceItems, grandTotal } = this.collectServiceItems();
                const oPayload = this._buildPayload(aServiceItems, grandTotal);

                this._confirmSubmission(oPayload);
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        // Get service period as string
        getServicePeriodString: function () {
            const oServicePeriodInput = this.byId("idServicePeriod");
            const dateRange = oServicePeriodInput.getDateValue() && oServicePeriodInput.getSecondDateValue()
                ? [oServicePeriodInput.getDateValue(), oServicePeriodInput.getSecondDateValue()]
                : null;

            if (!dateRange) return "";

            const formattedDate = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
            return `${formattedDate.format(dateRange[0])} to ${formattedDate.format(dateRange[1])}`;
        },

        // Collect and validate service items
        collectServiceItems: function () {
            const aSrvItemRows = this.getView().getModel("selItemModel").getProperty("/items");
            const aCleanItems = [];
            const oTotalSrvSheetVal = { totalSrvSheetVal: 0 };
            let grandTotal = 0;

            if (aSrvItemRows.length === 0) {
                throw new Error("At least one Service Item must be present.");
            }

            for (const rowItem of aSrvItemRows) {
                const iUnitPrice = Number(rowItem.UNIT_PRICE || 0);
                const iTotalPrice = Number(rowItem.TOTAL_PRICE || 0);

                if (iUnitPrice <= 0) {
                    throw new Error(`Row ${rowItem.SR_NO}: Unit Price cannot be empty or negative number.`);
                }

                if (this.srvType === "Planned") {
                    this._validatePlannedItem(rowItem);
                } else if (this.srvType === "Un-planned") {
                    this._validateUnplannedItem(rowItem);
                }

                // Calculate line total differently for planned vs unplanned
                const lineTotal = this.srvType === "Planned"
                    ? this._calculatePlannedLineTotal(rowItem, iUnitPrice)
                    : this._calculateUnplannedLineTotal(rowItem, iUnitPrice);

                grandTotal += lineTotal;

                aCleanItems.push(this._buildCleanItem(rowItem, iUnitPrice));
            }

            oTotalSrvSheetVal.totalSrvSheetVal = Number(oTotalSrvSheetVal.totalSrvSheetVal.toFixed(2));
            return { items: aCleanItems, grandTotal };
        },

        // Validate form inputs
        _validateForm: function () {
            const oView = this.getView();
            const sPeriod = this.getServicePeriodString();
            const sServiceLoc = oView.byId("idServiceLocation").getValue().trim();
            const sResp = oView.byId("idPersonResponsible").getValue().trim();
            const aAttachments = oView.getModel("attachmentsModel").getProperty("/attachments") || [];

            if (!sPeriod) {
                MessageBox.error("Service Period is mandatory.");
                return false;
            }
            if (!sServiceLoc) {
                MessageBox.error("Service Location is mandatory.");
                return false;
            }
            if (!sResp) {
                MessageBox.error("Person Responsible is mandatory.");
                return false;
            }
            if (!aAttachments.length) {
                MessageBox.error("At least one attachment is required.");
                return false;
            }

            return true;
        },

        // Build submission payload
        _buildPayload: function (aServiceItems, grandTotal) {
            const oView = this.getView();
            const oHeaderData = oView.getModel("poModel").getProperty("/0") || {};
            const aAttachments = oView.getModel("attachmentsModel").getProperty("/attachments");

            return {
                action: "CREATE",
                TOTAL_AMOUNT: grandTotal,
                servicehead: [{
                    SERVICE_PERIOD: this.getServicePeriodString(),
                    SERVICE_LOCATION: oView.byId("idServiceLocation").getValue().trim(),
                    PERSON_RESPONSIBLE: oView.byId("idPersonResponsible").getValue().trim(),
                    COMPANY_CODE: oHeaderData.Bukrs || oHeaderData.COMPANY_CODE || "",
                    PO_NUMBER: this.poNo,
                    AMOUNT: (oHeaderData.Amount || oHeaderData.AMOUNT || "0").toString(),
                    TYPE: this.srvType,
                    SUPPLIER_NUMBER: oHeaderData.Lifnr,
                    SUPPLIER_NAME: oHeaderData.LIFNR_NAME
                }],
                serviceitem: aServiceItems,
                attachments: aAttachments.map(a => ({
                    base64value: a.IMAGEURL,
                    DESCRIPTION: a.DESCRIPTION || a.IMAGE_FILE_NAME,
                    COMMENT: a.COMMENT || ""
                }))
            };
        },

        // Confirm submission with user
        _confirmSubmission: function (oPayload) {
            MessageBox.confirm(
                "Are you sure you want to submit?",
                {
                    title: "Confirm submission",
                    icon: MessageBox.Icon.QUESTION,
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.YES) {
                            this._submitData(oPayload);
                        }
                    }
                }
            );
        },

        // Submit data to backend
        _submitData: function (oPayload) {
            
            const oView = this.getView();
            oView.setBusy(true);

            this.getView().getModel().create("/submitSES", oPayload, {
                method: "POST",
                success: (oData) => {
                    oView.setBusy(false);
                    this._handleSubmissionSuccess(oData);
                },
                error: (oErr) => {
                    oView.setBusy(false);
                    this._handleSubmissionError(oErr);
                }
            });
        },

        // Handle successful submission
        _handleSubmissionSuccess: function (oData) {
            MessageBox.success(
                oData.submitSES.returnMessage || "Your Service Entry Sheet has been submitted successfully!!",
                {
                    title: "Success",
                    icon: MessageBox.Icon.Success,
                    actions: [MessageBox.Action.OK],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            this._navigateAfterSubmission();
                        }
                    }
                }
            );
        },

        // Handle submission error
        _handleSubmissionError: function (oErr) {
            const sMsg = oErr.responseText
                ? JSON.parse(oErr.responseText).error.message
                : "Submission failed";
            MessageBox.error(sMsg.value);
        },

        // Navigate after successful submission
        _navigateAfterSubmission: function () {
            this.resetData();
            const oView = this.getView();
            const oRouter = this.getOwnerComponent().getRouter();

            oView.setBusy(true);
            oRouter.navTo("RouteListReport");

            oRouter.getRoute("RouteListReport").attachPatternMatched(() => {
                oView.setBusy(false);
            }, null, { once: true });
        },

        // Reset all data
        resetData: function () {
            this._resetFormFields();
            localStorage.setItem("selectedItems", JSON.stringify({
                srvType: "", items: []
            }));
            this._previousTotalSrvValue = 0;

            const oView = this.getView();
            oView.getModel("selItemModel").setData({});
            oView.getModel("attachmentsModel").setProperty("/attachments", []);
            oView.getModel("poModel").setProperty("/0", {});
        },

        // Cancel and navigate back
        onPressCancel: function () {
            this.resetData();
            const oView = this.getView();
            const oRouter = this.getOwnerComponent().getRouter();

            oView.setBusy(true);
            oRouter.navTo("RouteListReport");

            oRouter.getRoute("RouteListReport").attachPatternMatched(() => {
                oView.setBusy(false);
            }, null, { once: true });
        },

        // Add new item (for unplanned)
        onAddPress: function () {
            const oModel = this.getView().getModel("selItemModel");
            const aItems = oModel.getProperty("/items") || [];
            const lastSRNo = aItems.length > 0 ? Math.max(...aItems.map(item => item.SR_NO)) : 0;

            aItems.push({
                ITEM_NUMBER: lastSRNo + 1,
                SR_NO: lastSRNo + 1,
                SERVICE_NUMBER: "",
                SERVICE_DESCRIPTION: "",
                ORDERED_QUANTITY: "",
                UNIT_OF_MEASURE: "",
                UNIT_PRICE: "",
                SERVICE_QUANTITY: 1,
                TOTAL_PRICE: ""
            });

            oModel.setProperty("/items", aItems);
            this._updateTotalPrice();
            this.updateLocalStorage();
        },

        // Delete item (for unplanned)
        onDeletePress: function (oEvent) {
            const oTable = oEvent.getSource().getParent().getParent();
            const aSelectedItems = oTable.getSelectedItems();

            if (aSelectedItems.length === 0) {
                MessageBox.error("Please select an item to delete.");
                return;
            }

            const oModel = this.getView().getModel("selItemModel");
            const aItems = oModel.getProperty("/items");

            for (let i = aSelectedItems.length - 1; i >= 0; i--) {
                const oSelectedItem = aSelectedItems[i];
                const oData = oSelectedItem.getBindingContext("selItemModel").getObject();
                const index = aItems.findIndex(item => item.SR_NO === oData.SR_NO);
                if (index !== -1) aItems.splice(index, 1);
            }

            oModel.setProperty("/items", aItems);
            this._updateTotalPrice();
            this.updateLocalStorage();
        },

        // Update localStorage
        updateLocalStorage: function () {
            const oModel = this.getView().getModel("selItemModel");
            localStorage.setItem("selectedItems", JSON.stringify(oModel.getData()));
        },

        // Calculate line total for planned items
        _calculatePlannedLineTotal: function (rowItem, unitPrice) {
            const serviceQty = Number(rowItem.newField || 0);
            const servicedQty = Number(rowItem.SERVICE_QUANTITY || 0);
            return unitPrice * (serviceQty + servicedQty);
        },

        // Calculate line total for unplanned items
        _calculateUnplannedLineTotal: function (rowItem, unitPrice) {
            const serviceQty = Number(rowItem.SERVICE_QUANTITY || 0);
            return unitPrice * serviceQty;
        },

        // Validate planned item
        _validatePlannedItem: function (rowItem) {
            if (rowItem.newField === undefined || isNaN(rowItem.newField)) {
                throw new Error(`Row ${rowItem.SR_NO}: Service Quantity cannot be empty.`);
            }

            if (rowItem.SERVICE_QUANTITY === undefined) {
                throw new Error(`Row ${rowItem.SR_NO}: Serviced Quantity cannot be empty.`);
            }

            const iServiceQty = Number(rowItem.newField || "");
            const iServicedQty = Number(rowItem.SERVICE_QUANTITY || 0);
            const iOrderedQty = Number(rowItem.ORDERED_QUANTITY || 0);
            const remainingAllowed = iOrderedQty - (iServiceQty + iServicedQty);

            if (remainingAllowed < 0) {
                throw new Error(
                    `Row ${rowItem.SR_NO}: Service Quantity (${Math.abs(iServicedQty)}) exceeds remaining ` +
                    `allowed quantity (${remainingAllowed}).`
                );
            }
        },

        // Validate unplanned item
        _validateUnplannedItem: function (rowItem) {
            if (!rowItem.SERVICE_NUMBER) {
                throw new Error(`Row ${rowItem.SR_NO}: Service Number cannot be empty.`);
            }
            if (rowItem.SERVICE_QUANTITY === undefined) {
                throw new Error(`Row ${rowItem.SR_NO}: Service Quantity cannot be empty.`);
            }

            const iServiceQty = Number(rowItem.SERVICE_QUANTITY);
            const iMaxOrderAmount = Number(this.getView().getModel("poModel").getProperty("/0/Amount") || 0);
            const lineTotal = Number(rowItem.UNIT_PRICE) * iServiceQty;

            if (lineTotal > iMaxOrderAmount) {
                throw new Error(
                    `Total Service Sheet Value (${lineTotal}) cannot exceed ` +
                    `total amount (${iMaxOrderAmount})`
                );
            }
        },

        // Build clean item object
        _buildCleanItem: function (rowItem, iUnitPrice) {
            const iServiceQty = this.srvType === "Planned"
                ? Number(rowItem.newField || "")
                : Number(rowItem.SERVICE_QUANTITY);

            return {
                SR_NO: String(rowItem.SR_NO),
                SERVICE_NUMBER: String(rowItem.SERVICE_NUMBER),
                SERVICE_DESCRIPTION: rowItem.SERVICE_DESCRIPTION,
                ORDERED_QUANTITY: rowItem.ORDERED_QUANTITY ? Number(rowItem.ORDERED_QUANTITY) : 0,
                UNIT_OF_MEASURE: rowItem.UNIT_OF_MEASURE,
                UNIT_PRICE: iUnitPrice,
                SERVICE_QUANTITY: iServiceQty,
                // TOTAL_PRICE: iUnitPrice * iServiceQty,
                TOTAL_PRICE: Number(rowItem.TOTAL_PRICE),
                ITEM_NUMBER: String(rowItem.ITEM_NUMBER),
                packno: rowItem.packno,
                introw: rowItem.introw,
                packageNofromPO: rowItem.packageNofromPO
            };
        },


        /**
        * Handles service number value help request
        */
        onServiceNumberValueHelp: function (oEvent) {
            const oView = this.getView();
            const oSource = oEvent.getSource();

            // Store current binding context
            this._sCurrentSelectedPath = oSource.getBindingContext("selItemModel").getPath();
            this._oBasicSearchField = new sap.m.SearchField();

            // Set busy state
            oView.byId("idObjectPage").setBusy(true);

            // Load value help dialog fragment
            Fragment.load({
                id: oView.getId(),
                name: "com.aisp.aispsupplierportal.view.SrvValHelp",
                controller: this
            }).then(function (oDialog) {
                this._setupValueHelpDialog(oDialog);
                oView.byId("idObjectPage").setBusy(false);
                oDialog.open();
            }.bind(this)).catch(function (err) {
                oView.byId("idObjectPage").setBusy(false);
                console.error("Error loading ValueHelpDialog:", err);
                MessageBox.error("Failed to load service number selection");
            });
        },

        /**
         * Sets up the value help dialog components
         */
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
            oDialog.getTableAsync().then(function (oTable) {
                oTable.setModel(this.oProductsModel);

                if (oTable.bindRows) { // Desktop table
                    this._setupDesktopTable(oTable);
                } else if (oTable.bindItems) { // Mobile table
                    this._setupMobileTable(oTable);
                }

                oDialog.update();
            }.bind(this));
        },

        /**
         * Sets up desktop table configuration
         */
        _setupDesktopTable: function (oTable) {
            // Bind data
            oTable.bindAggregation("rows", {
                path: "/ZI_AISP_ServicesVH",
                mode: "None",
                events: { dataReceived: () => this._oVHD.update() }
            });

            // Add columns
            const aColumns = [
                {
                    id: "colServiceNumber",
                    label: "Service Number",
                    template: new sap.m.Text({ text: "{ServiceNumber}" }),
                    fieldName: "ServiceText"
                },
                {
                    id: "colUnitOfMeasure",
                    label: "Unit Of Measure",
                    template: new sap.m.Text({ text: "{UnitOfMesure}" }),
                    fieldName: "UnitOfMesure"
                },
                {
                    id: "colServiceText",
                    label: "Service Description",
                    template: new sap.m.Text({ text: "{ServiceText}" }),
                    fieldName: "ServiceNumber"
                }
            ];

            aColumns.forEach(col => {
                const oColumn = new sap.ui.table.Column({
                    label: new sap.m.Label({ text: col.label }),
                    template: col.template
                });
                oColumn.data({ fieldName: col.fieldName });
                oTable.addColumn(oColumn);
            });
        },

        /**
         * Sets up mobile table configuration
         */
        _setupMobileTable: function (oTable) {
            // Bind data
            oTable.bindAggregation("items", {
                path: "/ZI_AISP_ServicesVH",
                template: new sap.m.ColumnListItem({
                    cells: [
                        new sap.m.Label({ text: "{ServiceNumber}" }),
                        new sap.m.Label({ text: "{ServiceText}" }),
                        new sap.m.Label({ text: "{UnitOfMesure}" })
                    ]
                }),
                events: { dataReceived: () => this._oVHD.update() }
            });

            // Add columns
            ["Service Number", "Service Description", "Unit Of Measure"].forEach(headerText => {
                oTable.addColumn(new sap.m.MColumn({
                    header: new sap.m.Label({ text: headerText })
                }));
            });
        },

        /**
         * Handles OK press in value help dialog
         */
        onValueHelpOkPress: function (oEvent) {
            const aTokens = oEvent.getParameters().tokens;

            if (aTokens.length > 1) {
                MessageBox.alert("Please select only one service number to proceed.");
                return;
            }

            if (aTokens.length === 0) {
                MessageBox.alert("Please select a service number.");
                return;
            }

            const oSelItemModel = this.getView().getModel("selItemModel");
            const selectedProperties = aTokens[0].data().row;
            const { ServiceNumber, ServiceText, UnitOfMesure } = selectedProperties;

            // Update model with selected values
            oSelItemModel.setProperty(`${this._sCurrentSelectedPath}/SERVICE_NUMBER`, ServiceNumber);
            oSelItemModel.setProperty(`${this._sCurrentSelectedPath}/SERVICE_DESCRIPTION`, ServiceText);
            oSelItemModel.setProperty(`${this._sCurrentSelectedPath}/UNIT_OF_MEASURE`, UnitOfMesure);

            this._oVHD.close();
        },

        /**
         * Handles Cancel press in value help dialog
         */
        onValueHelpCancelPress: function () {
            this._oVHD.close();
        },

        /**
         * Cleans up after dialog close
         */
        onValueHelpAfterClose: function () {
            if (this._oVHD) {
                this._oVHD.destroy();
                this._oVHD = null;
            }
            this._sCurrentSelectedPath = null;
            this._oBasicSearchField = null;
        },

        // Clean up on exit
        onExit: function () {
            this.resetData();
            if (this._oPlannedFragment) {
                this._oPlannedFragment.destroy();
                this._oPlannedFragment = null;
            }
            if (this._oUnplannedFragment) {
                this._oUnplannedFragment.destroy();
                this._oUnplannedFragment = null;
            }
            this.getView().byId("idTotalPrice").setText("Total Service Sheet Value : 00");
        }

        // Handle input changes
        // onInputChange: function (oEvent) {
        //     const oInput = oEvent.getSource();
        //     const inputId = oInput.getId();
        //     const inputSource = inputId.slice(2, inputId.indexOf("-"));

        //     if (this.srvType === "Planned" && inputSource === "PlannedSrvQtyInput") {
        //         this._handlePlannedQuantityChange(oEvent);
        //     } else if (this.srvType === "Un-planned") {
        //         this._handleUnplannedInputChange(oEvent, inputSource);
        //     }
        // },

        // Handle planned quantity changes
        // _handlePlannedQuantityChange: function (oEvent) {
        //     const oInput = oEvent.getSource();
        //     const oContext = oInput.getBindingContext("selItemModel");
        //     const oData = oContext.getObject();
        //     const serviceQuantity = Number(oInput.getValue());
        //     const orderedQuantity = Number(oData.ORDERED_QUANTITY);
        //     const servicedQuantity = Number(oData.SERVICE_QUANTITY);

        //     if (serviceQuantity < 0) {
        //         this._setInputErrorState(oInput, "Service Quantity cannot be less than 0.");
        //         return;
        //     }

        //     if (servicedQuantity + serviceQuantity > orderedQuantity) {
        //         this._setInputErrorState(
        //             oInput,
        //             "Service Quantity should not be greater than Remaining Ordered Quantity."
        //         );
        //         return;
        //     }

        //     oInput.setValueState(sap.ui.core.ValueState.None);
        //     oData.srvQtyFilled = oData.newField === undefined;
        //     oData.newField = serviceQuantity;
        //     this._updateTotalPrice();
        // },

        // Handle unplanned input changes
        // _handleUnplannedInputChange: function (oEvent, inputSource) {
        //     const oInput = oEvent.getSource();
        //     const oContext = oInput.getBindingContext("selItemModel");
        //     const oData = oContext.getObject();
        //     const value = Number(oInput.getValue());
        //     const property = inputSource === "UnplannedSrvQtyInput" ? "SERVICE_QUANTITY" : "UNIT_PRICE";
        //     const prevValue = oData[property];

        //     if (value < 0) {
        //         const message = inputSource === "UnplannedSrvQtyInput"
        //             ? "Service Quantity Cannot be a negative number."
        //             : "Unit Price Cannot be a negative number.";
        //         this._setInputErrorState(oInput, message);
        //         return;
        //     }

        //     oData[property] = value;
        //     try {
        //         this._updateTotalPrice();
        //         oInput.setValueState(sap.ui.core.ValueState.None);
        //     } catch (e) {
        //         oData[property] = prevValue;
        //         oInput.setValue(prevValue);
        //         this._setInputErrorState(oInput, e.message);
        //     }
        // },

        // Set input error state
        // _setInputErrorState: function (oInput, message) {
        //     oInput.setValueState(sap.ui.core.ValueState.Error);
        //     oInput.setValueStateText(message);
        // },

        // Handle input changes with enhanced validation
    });
});
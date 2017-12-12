/**
 * Code to trigger the mobile file manager's export/copy and remove link overlay and related behaviour
 */
mobile.linkOverlay = {

    /** jQuery selector for the overlay */
    $overlay: null,

    /**
     * Initialise the overlay
     * @param {String} nodeHandle A public or regular node handle
     */
    show: function(nodeHandle) {

        'use strict';

        // Store the selector as it is re-used
        this.$overlay = $('#mobile-ui-copy-link');

        // Get initial overlay details
        var node = M.d[nodeHandle];
        var fileName = node.name;
        var fileSizeBytes = node.s || node.tb;
        var fileSize = numOfBytes(fileSizeBytes);
        var fileSizeFormatted = fileSize.size + ' ' + fileSize.unit;
        var fileIconName = fileIcon(node);
        var fileIconPath = mobile.imagePath + fileIconName + '.png';

        // Set file name, size and image
        this.$overlay.find('.filename').text(fileName);
        this.$overlay.find('.filesize').text(fileSizeFormatted);
        this.$overlay.find('.filetype-img').attr('src', fileIconPath);

        // By default hide the public link and remove button also show the copy button as disabled
        this.$overlay.find('.public-link').addClass('hidden');
        this.$overlay.find('.copy').addClass('disabled');
        this.$overlay.find('.remove').addClass('disabled');

        // If a link already exists for this, show the link and copy/remove buttons
        if (node.ph) {
            this.showPublicLinkAndEnableButtons(nodeHandle);
        }
        else {
            // Otherwise create the link
            var exportLink = new mega.Share.ExportLink({
                'showExportLinkDialog': false,
                'updateUI': false,
                'nodesToProcess': [nodeHandle]
            });
            exportLink.getExportLink();
        }

        // Initialise the buttons
        this.initCopyButton(nodeHandle);
        this.initRemoveButton(nodeHandle);
        this.initCloseButton();

        // Disable scrolling of the file manager in the background to fix a bug on iOS Safari
        $('.mobile.file-manager-block').addClass('disable-scroll');

        // Show the overlay
        this.$overlay.removeClass('hidden').addClass('overlay');
    },

    /**
     * Initialise the Copy link button on the overlay
     * @param {String} nodeHandle The node handle for this file
     */
    initCopyButton: function(nodeHandle) {

        'use strict';

        // On Copy Link button click/tap
        this.$overlay.find('.copy').off('tap').on('tap', function() {

            // If the link is created (has a public handle), copy the public link to the clipboard
            if (M.d[nodeHandle].ph) {
                mobile.linkOverlay.copyPublicLink(nodeHandle);
            }

            // Prevent default anchor link behaviour
            return false;
        });
    },

    /**
     * Copy the public link to the user's clipboard
     */
    copyPublicLink: function() {

        'use strict';

        try {
            // Select / highlight the text
            document.getElementById('mobile-public-link').select();

            // Copy it to the clipboard
            var success = document.execCommand('copy');

            // If it succeeded, show a toast message at the top of the page (because of the onscreen keyboard)
            if (success) {
                mobile.showToast(l[7677]);    // Link copied
            }
            else {
                // Otherwise tell them to copy manually
                mobile.showToast(l[16348]);
            }
        }
        catch (exception) {

            // If not supported, tell them to copy manually
            mobile.showToast(l[16348]);
        }
    },

    /**
     * Shows the public link in a text area, also enables the copy and remove buttons
     * @param {String} nodeHandle The internal node handle
     */
    showPublicLinkAndEnableButtons: function(nodeHandle) {

        'use strict';

        // Format the public link with key
        var publicUrl = this.formatLink(nodeHandle);

        // Cache some selectors
        var $overlay = mobile.linkOverlay.$overlay;
        var $publicLinkTextField = $overlay.find('.public-link');
        var $copyLinkButton = $overlay.find('.copy');
        var $removeLinkButton = $overlay.find('.remove');

        // Set the URL into the text field
        $publicLinkTextField.removeClass('hidden').val(publicUrl);

        // check if we are on ios (doesnt allow copy to clipboard)
        if (!is_ios) {
            $copyLinkButton.removeClass('disabled');
        }
        else {
            $copyLinkButton.addClass('hidden');
        }
        $removeLinkButton.removeClass('disabled');

        // Update the link icon in the file manager view
        mobile.cloud.updateLinkIcon(nodeHandle);
    },

    /**
     * Formats the public link with key
     * @param {String} nodeHandle The internal node handle
     * @returns {String} Returns the URL in format:
     *                   https://mega.nz/#!X4NiADjR!BRqpTTSy-4UvHLz_6sHlpnGS-dS0E_RIVCpGAtjFmZQ
     */
    formatLink: function(nodeHandle) {

        'use strict';

        var node = M.d[nodeHandle];
        var key = null;
        var type = '';

        // If folder
        if (node.t) {
            type = 'F';
            key = u_sharekeys[node.h] && u_sharekeys[node.h][0];
        }
        else {
            // Otherwise for file
            key = node.k;
        }

        // Create the URL
        var nodeUrlWithPublicHandle = getBaseUrl() + '/#' + type + '!' + node.ph;
        var nodeDecryptionKey = key ? '!' + a32_to_base64(key) : '';
        var publicUrl = nodeUrlWithPublicHandle + nodeDecryptionKey;

        return publicUrl;
    },

    /**
     * Initialise the Remove link button
     * @param {String} nodeHandle The node handle for this file
     */
    initRemoveButton: function(nodeHandle) {

        'use strict';

        // On Remove Link button click/tap
        this.$overlay.find('.remove').off('tap').on('tap', function() {

            // Remove the link
            var exportLink = new mega.Share.ExportLink({
                'showExportLinkDialog': false,
                'updateUI': false,
                'nodesToProcess': [nodeHandle]
            });
            exportLink.removeExportLink();

            // Prevent default anchor link behaviour
            return false;
        });
    },

    /**
     * Completes removal of the link by showing a toast message and hiding the Link/Export overlay
     * @param {String} nodeHandle The internal node handle
     */
    completeLinkRemovalProcess: function(nodeHandle) {

        'use strict';

        // Show a toast message, hide the overlay and update the link icon
        mobile.showToast(l[8759]);                                        // Link removed
        mobile.linkOverlay.$overlay.addClass('hidden');
        mobile.cloud.updateLinkIcon(nodeHandle);

        // Re-show the file manager and re-enable scrolling
        $('.mobile.file-manager-block').removeClass('hidden disable-scroll');
    },

    /**
     * Initialises the close button on the overlay
     */
    initCloseButton: function() {

        'use strict';

        var $closeButton = this.$overlay.find('.fm-dialog-close');

        // Add tap handler
        $closeButton.off('tap').on('tap', function() {

            // Hide overlay
            mobile.linkOverlay.$overlay.addClass('hidden');

            // Re-show the file manager and re-enable scrolling
            $('.mobile.file-manager-block').removeClass('hidden disable-scroll');

            // Prevent clicking the menu button behind
            return false;
        });
    }
};

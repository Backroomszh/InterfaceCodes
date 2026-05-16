// This script fully hides the VisualEditor tool, leaving it's functionality inaccessible.
// It does not entirely undo the changes, but does restore old look and user-facing behavior.

// It's bound to break on the slightest changes to VE itself, and might not cooperate
// with other scripts which poke around the article tabs or section edit links.

// Use at your own risk, and pester the VE team to restore the option to disable VisualEditor
// if you believe it is necessary.

$(document).ready(function () {
    var state = mw.loader.getState('ext.visualEditor.desktopArticleTarget.init');
    if (state !== 'registered') {
        // 'registered' actually means 'not loading'
        mw.loader.using('ext.visualEditor.desktopArticleTarget.init', function () {
            // Kill the tab
            if ($('#ca-editsource').length > 0) {
                var caEdit = $('#ca-edit a');
                $('#ca-editsource a').text(caEdit.text());
                $('#ca-edit').remove();
                $('#ca-editsource').attr('id', 'ca-edit');

                // Kill the section edit links
                $('.mw-editsection-link-secondary')
                    .text($('.mw-editsection-link-primary').eq(0).text())
                    .off('focus blur');
                $('.mw-editsection-divider, .mw-editsection-link-primary').remove();
                $('.mw-editsection-bracket:not(:first-of-type):not(:last-of-type)').remove();
                $('.mw-editsection-bracket, .mw-editsection-link-secondary').css('visibility', '');
                $('h1, h2, h3, h4, h5, h6').off('mouseenter mouseleave');
            }
        });
    }
});

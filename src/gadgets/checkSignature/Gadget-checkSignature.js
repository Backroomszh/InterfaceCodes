/*
	Prevent non-signature comment [[w:User:Cpro|cpro]] 2012年12月6日 (木) 07:39 (UTC)

	This script is under the public domain.
	You can freely use, modify, or redistribute it at your own risk.

	Modified in December 2023 by [[w:User:Dragoniez]]
	Modified in July 2024 by [[User:Waki285]]
 */
(function () {
    var wgAction = mw.config.get('wgAction');
    if (['edit', 'submit'].indexOf(wgAction) === -1) {
        return;
    }

    /**
     * @type {Record<number, string[]>}
     */
    /* eslint-disable quotes */
    var rTitles = {
        0: [
            '^Steward requests/(?!header|Archive)',
            '^Requests for global permissions$',
            '^Community portal$',
            '^Requests for Comment/',
        ],
        4: ["^Administrators' noticeboard$", '^Community portal$'],
    };
    var ns = mw.config.get('wgNamespaceNumber');
    if (
        ns < 0 ||
        (ns % 2 === 0 && !rTitles[ns]) || // Can be divided by 2 and does not match any of the keys in rTitles
        (rTitles[ns] && !new RegExp(rTitles[ns].join('|')).test(mw.config.get('wgTitle'))) // Matches the key of rtitles but the page name does not match
    ) {
        return;
    }

    $.when(mw.loader.using(['oojs-ui-core', 'oojs-ui-windows']), $.ready).then(function () {
        var $textbox = $('#wpTextbox1');
        var $saveButton = $('#wpSave');
        var $form = $('#editform');
        if (!$textbox.length || !$saveButton.length || !$form.length) {
            return;
        }

        var originalText = $textbox.val();
        if (typeof originalText !== 'string') {
            return;
        }

        $saveButton.off('click').on('click', function (e) {
            var isMinorEdit = $('#wpMinoredit').prop('checked');

            // Is the "Don't display popups even if there is no signature when minor edits are checked" gadget enabled?
            var suppressWhenMinor =
                mw.loader.getState('ext.gadget.checkSignature-suppressWhenMinor') === 'ready';

            if (isMinorEdit && suppressWhenMinor) {
                return;
            }

            var text = $textbox.val();
            if (typeof text !== 'string' || (wgAction === 'edit' && text === originalText)) {
                return;
            }

            var rSig = /[^~]~~~~(?!~)/;
            if (/^\s*~~~~(?!~)/.test(text)) {
                return;
            } else if (rSig.test(text)) {
                // Ensure that signatures are not in comments or in nowiki
                var rTag = {
                    comment: {
                        // Comments
                        start: /^<!--/,
                        end: /^-->/,
                    },
                    nowiki: {
                        // Nowikis
                        start: /^<nowiki[^>\n]*>/,
                        end: /^<\/nowiki[^>\n]*>/,
                    },
                };
                var rClose, m;
                for (var i = 0; i < text.length; i++) {
                    var substr = text.slice(i);

                    if (!rClose && substr.search(rSig) === 0) {
                        return;
                    } else if (!rClose) {
                        if ((m = rTag.comment.start.exec(substr))) {
                            rClose = rTag.comment.end;
                            i += m[0].length - 1;
                        } else if ((m = rTag.nowiki.start.exec(substr))) {
                            rClose = rTag.nowiki.end;
                            i += m[0].length - 1;
                        }
                    } else if (rClose && (m = rClose.exec(substr))) {
                        rClose = void 0;
                        i += m[0].length - 1;
                    }
                }
            }

            // If the script gets there far it is unsigned
            e.preventDefault();
            OO.ui
                .confirm(
                    $('<p>').html(
                        '<a style="float:right;font-size:x-small;margin-top:-1em;" onclick="alert(`This is powered by a gadget, which can be disabled by disabling gadgets in your preferences.`)" href="javascript:void(0);">What\'s this?</a><p style="clear:both;">Your comment is unsigned. Do you want to save it anyway?</p>',
                    ),
                )
                .then(function (confirmed) {
                    if (confirmed) {
                        $form.trigger('submit');
                    }
                });
        });
    });
})();
//</nowiki>

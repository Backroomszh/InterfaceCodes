/**
 * Support "class=tpl-copy" on syntaxhighlight blocks.
 *
 * See also: [[MediaWiki:Gadget-site-tpl-copy.css]]
 * Source: https://www.mediawiki.org/wiki/MediaWiki:Gadget-site-tpl-copy.js
 */

var hasFeature = navigator.clipboard && 'writeText' in navigator.clipboard;
if (hasFeature) {
    // Add type=button to avoid form submission in preview ([[Special:Permalink/6335352]])
    var $btn = $('<button>')
        .attr('type', 'button')
        .text('Copy')
        .on('click', function () {
            /* eslint-disable @typescript-eslint/no-this-alias */
            var btn = this;
            var wrapper = btn.closest('.tpl-copy');
            var preNode = wrapper && wrapper.querySelector('pre');
            var content = preNode && preNode.textContent.trim();
            try {
                navigator.clipboard.writeText(content);
            } catch {
                return;
            }
            var prevLabel = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () {
                btn.textContent = prevLabel;
            }, 5000);
        });

    mw.hook('wikipage.content').add(function ($content) {
        $content
            .find('.tpl-copy:not(.tpl-copy--bound)')
            .append($btn.clone(true))
            .addClass('tpl-copy--bound');
    });
}

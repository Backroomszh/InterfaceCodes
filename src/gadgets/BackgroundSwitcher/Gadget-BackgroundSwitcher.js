/* 喵喵喵！ */
mw.loader.using(['mediawiki.util'], function () {
    $(function () {
        var rules = [];

        $('.bg-source').each(function () {
            var url = this.dataset.bg;
            if (!url) return;

            var $box = $(this).closest('.mw-collapsible[id^="mw-customcollapsible-"]');

            var selector;
            if ($box.length) {
                var id = $box.attr('id');           // 例：mw-customcollapsible-foo
                selector = 'body:has(#' + id + ':not(.mw-collapsed))::after';
            } else {
                selector = 'body::after';
            }

            rules.push(
                selector + '{' +
                'background:url("' + url + '") no-repeat center / cover fixed !important;' +
                '}'
            );
        });

        if (rules.length) {
            mw.util.addCSS(rules.join('\n'));
        }
    });
});
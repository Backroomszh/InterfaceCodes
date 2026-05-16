$(function () {
    var i18n = {
        header: 'Back to Top',
    };

    new ResizeObserver(function () {
        if (window.innerWidth <= 720) {
            $('#mw-panel').css('height', '');
        } else {
            $('#mw-panel').css('height', document.body.scrollHeight - 10);
        }
    }).observe($('#content')[0]);
    $(
        '<nav id="p-btt" class="vector-menu mw-portlet mw-portlet-btt vector-menu-portal portal collapsed" aria-labelledby="p-btt-label" role="navigation">',
    )
        .append(
            $('<h3 id="p-btt-label" class="vector-menu-heading" tabindex="0">')
                .append($('<span class="vector-menu-heading-label">').text(i18n.header))
                .on('keypress', function (event) {
                    if (event.which === 13) {
                        $(this).trigger('click');
                        event.stopImmediatePropagation();
                    }
                })
                .on('click', function (event) {
                    var isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    event.stopPropagation();
                    window.scrollTo({
                        top: 0,
                        behavior: isReduced ? 'instant' : 'smooth',
                    });
                }),
        )
        .appendTo('#mw-panel');
});

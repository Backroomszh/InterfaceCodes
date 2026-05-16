/* global InPageEdit */
const addQuickEditButton = () => {
    if ($('#ca-quickedit').length || !mw.config.get('wgIsProbablyEditable')) {
        return;
    }

    var $editButton = $('#ca-edit');
    if ($editButton.length) {
        var $quickEdit = $('<li>')
            .attr('id', 'ca-quickedit')
            .addClass('vector-tab-noicon mw-list-item')
            .append(
                $('<a>')
                    .attr({
                        href: '#',
                        title: 'InPageEdit',
                        class: 'vector-tab-noicon',
                    })
                    .text('快速编辑')
                    .click(function (e) {
                        e.preventDefault();
                        if (window.InPageEdit) {
                            InPageEdit.quickEdit({
                                page: mw.config.get('wgPageName'),
                                revision: mw.config.get('wgRevisionId') || undefined,
                            });
                        }
                    }),
            );
        $editButton.after($quickEdit);
    }
};
mw.loader.load(
    '//saozh.miraheze.org/wiki/MediaWiki:Gadget-InPageEdit.js?action=raw&ctype=text/javascript',
);
mw.loader.using(['mediawiki.util']).then(function () {
    if ($('#ca-quickedit').length) {
        return;
    }
    mw.hook('ve.activationComplete').add(addQuickEditButton);
    mw.hook('wikipage.content').add(addQuickEditButton);
    addQuickEditButton();
});

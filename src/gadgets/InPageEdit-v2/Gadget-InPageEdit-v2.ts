interface InPageEditAPI {
    quickEdit(options: { page: string; revision?: number }): void;
}

declare const InPageEdit: InPageEditAPI | undefined;

(() => {
    if ($('#ca-quickedit').length) {
        return;
    }

    const addQuickEditButton = () => {
        const { wgIsProbablyEditable, wgRevisionId, wgPageName } = mw.config.get();
        if ($('#ca-quickedit').length || !wgIsProbablyEditable) {
            return;
        }

        const $editButton = $('#ca-edit');
        if ($editButton.length) {
            const $quickEdit = $('<li>')
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
                        .on('click', e => {
                            e.preventDefault();
                            if (typeof InPageEdit !== 'undefined') {
                                const revision = wgRevisionId;
                                InPageEdit.quickEdit({
                                    page: wgPageName,
                                    ...(revision ? { revision } : {}),
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
    mw.hook('ve.activationComplete').add(addQuickEditButton);
    mw.hook('wikipage.content').add(addQuickEditButton);
    addQuickEditButton();
})();

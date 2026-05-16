$(() => {
    if (mw.config.get('wgAction') === 'delete') {
        $('#wpReason input').val('');
    }
});

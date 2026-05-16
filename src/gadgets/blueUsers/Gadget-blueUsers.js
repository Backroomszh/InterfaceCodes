(() => {
    const { namespaceIds, wgUserName } = mw.config.get(['wgNamespaceIds', 'wgUserName']);
    const namespaces = Object.keys(namespaceIds).filter(ns => namespaceIds[ns] === 2);
    const selector = namespaces.map(ns => 'a.new[href^="' + mw.util.getUrl(ns) + ':"i]').join(',');
    // User cache to not check them multiple times.
    const blueUsers = [];
    const missingUsers = [];
    if (wgUserName) {
        blueUsers.push(mw.util.wikiUrlencode(wgUserName));
    }
    const api = new mw.Api({
        parameters: {
            action: 'query',
            list: 'users',
            formatversion: 2,
        },
    });

    const makeUsersBlue = $content => {
        const users = [];
        const userlinks = $content.find(selector).each(function () {
            const encodedUsername = this.pathname.split(':')[1];
            if (missingUsers.includes(encodedUsername)) {
                return;
            }
            if (blueUsers.includes(encodedUsername)) {
                this.href = this.pathname;
                this.classList.remove('new');
                this.classList.add('mw-newuserlink');
                return;
            }
            const username = decodeURIComponent(encodedUsername);
            if (users.includes(username) || username.includes('/')) {
                return;
            }
            users.push(username);
        });
        if (!users.length) {
            return;
        }
        const apiRequests = [];
        while (users.length) {
            apiRequests.push(
                api
                    .get({
                        ususers: users.splice(0, 50),
                    })
                    .done(function (data) {
                        data.query.users.forEach(function (user) {
                            if (user.missing || user.invalid) {
                                missingUsers.push(mw.util.wikiUrlencode(user.name));
                                return;
                            }
                            blueUsers.push(mw.util.wikiUrlencode(user.name));
                        });
                    }),
            );
        }
        Promise.all(apiRequests).then(() => {
            userlinks.each(function () {
                if (!blueUsers.includes(this.pathname.split(':')[1])) {
                    return;
                }
                this.href = this.pathname;
                this.classList.remove('new');
                this.classList.add('mw-newuserlink');
            });
        });
    };

    // Run every time content is added
    mw.hook('wikipage.content').add(makeUsersBlue);
    // Catch links outside the content area
    makeUsersBlue($(selector).not('#mw-content-text a.new').parent());
})();

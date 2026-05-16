mw.loader.using(['mediawiki.api', 'mediawiki.util']).then(function () {
    const namespaceIds = mw.config.get('wgNamespaceIds');
    const namespaces = Object.keys(namespaceIds).filter(ns => namespaceIds[ns] === 2);
    const selector = namespaces.map(ns => 'a.new[href^="' + mw.util.getUrl(ns) + ':"i]').join(',');
    // User cache to not check them multiple times.
    var blueUsers = [];
    var missingUsers = [];
    if (mw.config.get('wgUserName')) {
        blueUsers.push(mw.util.wikiUrlencode(mw.config.get('wgUserName')));
    }
    var api = new mw.Api({
        parameters: {
            action: 'query',
            list: 'users',
            formatversion: 2,
        },
    });

    const makeUsersBlue = $content => {
        var users = [];
        var userlinks = $content.find(selector).each(function () {
            var encodedUsername = this.pathname.split(':')[1];
            if (missingUsers.includes(encodedUsername)) {
                return;
            }
            if (blueUsers.includes(encodedUsername)) {
                this.href = this.pathname;
                this.classList.remove('new');
                this.classList.add('mw-newuserlink');
                return;
            }
            var username = decodeURIComponent(encodedUsername);
            if (users.includes(username) || username.includes('/')) {
                return;
            }
            users.push(username);
        });
        if (!users.length) {
            return;
        }
        var apiRequests = [];
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
        Promise.all(apiRequests).then(function () {
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
});

interface ApiUserEntry {
    name: string;
    missing?: boolean;
    invalid?: boolean;
}
interface ApiQueryResponse {
    query: {
        users: ApiUserEntry[];
    };
}
(() => {
    const { wgNamespaceIds, wgUserName } = mw.config.get(['wgNamespaceIds', 'wgUserName']);
    const namespaces = Object.keys(wgNamespaceIds).filter(ns => wgNamespaceIds[ns] === 2);
    const selector = namespaces.map(ns => `a.new[href^="${mw.util.getUrl(ns)}:"i]`).join(',');
    // User cache to not check them multiple times.
    const blueUsers: string[] = [];
    const missingUsers: string[] = [];
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

    const getEncodedUsername = (el: HTMLElement): string | undefined => {
        const anchor = el as HTMLAnchorElement;
        return anchor.pathname.split(':')[1];
    };

    const makeUsersBlue = ($content: JQuery): void => {
        const users: string[] = [];
        const userlinks = $content.find(selector).each(function (this: HTMLElement) {
            const encodedUsername = getEncodedUsername(this);
            if (!encodedUsername || missingUsers.includes(encodedUsername)) {
                return;
            }
            if (blueUsers.includes(encodedUsername)) {
                const anchor = this as HTMLAnchorElement;
                anchor.href = anchor.pathname;
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
        const apiRequests: JQueryPromise<unknown>[] = [];
        while (users.length) {
            apiRequests.push(
                api
                    .get({
                        ususers: users.splice(0, 50),
                    })
                    .then(data => {
                        const result = data as ApiQueryResponse;
                        result['query'].users.forEach(user => {
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
            userlinks.each(function (this: HTMLElement) {
                const encodedUsername = getEncodedUsername(this);
                if (!encodedUsername || !blueUsers.includes(encodedUsername)) {
                    return;
                }
                const anchor = this as HTMLAnchorElement;
                anchor.href = anchor.pathname;
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

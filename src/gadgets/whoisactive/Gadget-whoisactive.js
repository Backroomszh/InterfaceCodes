$(function () {
    const filteredLinks = [];
    const localizedUserNamespace = mw.config.get('wgFormattedNamespaces')[2];
    $('.mw-body-content')
        .find('a[title^="User:"], a[title^="' + localizedUserNamespace + ':"]')
        .each(function () {
            const link = $(this);
            const href = decodeURI(link.attr('href'));
            const userRegex = new RegExp('((User)|(' + localizedUserNamespace + ')):(.*?)(?=&|$)');
            const username = href.match(userRegex);
            if (username[0].indexOf('/') === -1) {
                filteredLinks.push({
                    username: username[0],
                    element: link,
                });
            }
        });

    if (!filteredLinks.length) {
        return;
    }

    const RECENT = 'recent';
    const THISYEAR = 'thisyear';
    const OVERAYEAR = 'overayear';

    const messages = {
        en: {
            recent: 'Edited recently',
            thisyear: 'Edited this year',
            overayear: 'Edited over a year ago',
        },

        zh: {
            recent: '最近编辑',
            thisyear: '今年编辑',
            overayear: '一年前编辑',
        },

        de: {
            recent: 'kürzlich bearbeitet',
            thisyear: 'in diesem Jahr bearbeitet',
            overayear: 'vor über einem Jahr bearbeitet',
        },
        cs: {
            recent: 'editoval nedávno',
            thisyear: 'editoval tento rok',
            overayear: 'editoval před rokem',
        },
    };

    const localizedMessages = (function () {
        const lang = mw.config.get('wgUserLanguage');
        if (lang in messages) {
            return messages[lang];
        }
        return messages.zh;
    })();

    const getLastActiveMarker = function (timestamp) {
        const date = Date.parse(timestamp);
        const now = Date.now();
        const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        var timespan = RECENT;
        if (diff > 365) {
            timespan = OVERAYEAR;
        } else if (diff > 30) {
            timespan = THISYEAR;
        }
        const iconPath =
            'https://static.miraheze.org/backroomszhwiki/1/1d/UserContributions-ltr.svg';
        /* eslint-disable quotes */
        const marker =
            "<span class='mw-whoisactivegadget-span mw-whoisactivegadget-" +
            timespan +
            "'>" +
            "<img src='" +
            iconPath +
            "' class='mw-whoisactivegadget-filter-" +
            timespan +
            "'/> " +
            localizedMessages[timespan] +
            '<span>';
        return $(marker);
    };

    mw.loader.using(['mediawiki.api'], function () {
        filteredLinks.forEach(function (item) {
            const username = item.username;
            const element = item.element;
            const api = new mw.Api();
            api.get({
                format: 'json',
                action: 'query',
                list: 'usercontribs',
                uclimit: '1',
                ucuser: username,
            }).then(function (result) {
                if (result.query.usercontribs.length) {
                    const timestamp = result.query.usercontribs[0].timestamp;
                    getLastActiveMarker(timestamp).insertAfter(element);
                }
            });
        });
    });
});

(async () => {
    const { wgPageName, wgNamespaceNumber, wgUserGroups, wgArticleId } = mw.config.get([
        'wgPageName',
        'wgNamespaceNumber',
        'wgUserGroups',
        'wgArticleId',
    ]);
    const api = new mw.Api();

    if (
        wgNamespaceNumber !== 0 ||
        !wgUserGroups ||
        (!wgUserGroups.includes('moderator') && !wgUserGroups.includes('sysop')) ||
        wgPageName === 'Home'
    ) {
        return;
    }

    const reviewPageName = `Status:${wgPageName}`;

    const createButton = (html: string, action: () => void) => {
        const div = document.createElement('div');
        div.classList.add('citizen-header__item');

        const button = document.createElement('button');
        button.classList.add('citizen-header__button', 'citizen-button');
        button.innerHTML = html;
        button.onclick = action;

        div.appendChild(button);
        return div;
    };

    const updateReviewPage = (status: string) => {
        const text = `{{${status}|~~~~}}`;

        api.postWithToken('csrf', {
            action: 'edit',
            title: reviewPageName,
            text,
            tags: 'Automation tool',
            summary: `审核状态：${status}`,
        })
            .done(() => {
                mw.notify(`审核状态已更新：${status}`);
            })
            .fail(() => {
                mw.notify('更新失败', { type: 'error' });
            });
    };

    // ---- OOUI FailNotice Dialog ----

    /**
     * Dialog for inputting FailNotice text.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function FailNoticeDialog(this: any, config?: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (FailNoticeDialog as any).super.call(this, config);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const D = FailNoticeDialog as any;

    OO.inheritClass(D, OO.ui.ProcessDialog);

    D.static.name = 'failNoticeDialog';
    D.static.title = '输入 FailNotice';
    D.static.actions = [
        { action: 'submit', label: '发布', flags: ['primary'] },
        { action: 'cancel', label: '取消', flags: ['safe'] },
    ];

    D.prototype.initialize = function (this: any) {
        D.super.prototype.initialize.call(this);
        this.textInput = new OO.ui.MultilineTextInputWidget({
            placeholder: '请输入 FailNotice 内容...',
            rows: 8,
        });
        this.content = new OO.ui.PanelLayout({ padded: true });
        this.content.$element.append(this.textInput.$element);
        this.$body.append(this.content.$element);
    };

    D.prototype.getBodyHeight = function () {
        return 250;
    };

    D.prototype.getSetupProcess = function (this: any, data: any) {
        return D.super.prototype.getSetupProcess.call(this, data).next(() => {
            this.textInput.setValue('');
        });
    };

    D.prototype.getActionProcess = function (this: any, action: string) {
        if (action === 'submit') {
            return new OO.ui.Process(function (this: any) {
                const value = this.textInput.getValue().trim();
                if (!value) {
                    throw new Error('请输入 FailNotice 内容');
                }
                this.close({ action: 'submit', value });
            }, this);
        }
        if (action === 'cancel') {
            return new OO.ui.Process(function (this: any) {
                this.close({ action: 'cancel' });
            }, this);
        }
        return D.super.prototype.getActionProcess.call(this, action);
    };

    // ---- WindowManager singleton ----

    let windowManager: OO.ui.WindowManager | null = null;

    const getWindowManager = (): OO.ui.WindowManager => {
        if (!windowManager) {
            windowManager = new OO.ui.WindowManager();
            $(document.body).append(windowManager.$element);
            windowManager.addWindows([new (FailNoticeDialog as any)()]);
        }
        return windowManager;
    };

    // ---- CommentStreams API ----

    const postFailNotice = (wikitext: string) => {
        return api.postWithToken('csrf', {
            action: 'cspostcomment',
            commenttitle: 'FailNotice',
            wikitext,
            associatedid: wgArticleId,
        });
    };

    // ---- Query current review status ----

    const buttonText = (type: string, content: string) => {
        const regex = new RegExp(`${type}`, 'gui');
        const result = regex.test(content);
        const text = result ? `<b>${type}</b>` : type;

        return text;
    };

    const data = await api.post({
        action: 'query',
        titles: reviewPageName,
        prop: 'revisions',
        rvprop: 'content',
        formatversion: 2,
    });

    const content = data['query'].pages?.[0]?.revisions?.[0]?.content || '';

    const passText = content ? buttonText('Pass', content) : 'Pass';
    const failText = content ? buttonText('Fail', content) : 'Fail';

    // ---- Create buttons ----

    const passButton = createButton(passText, () => {
        updateReviewPage('Pass');
    });

    const failButton = createButton(failText, () => {
        // Original behavior: update review page status
        updateReviewPage('Fail');

        // Open OOUI dialog for optional FailNotice comment
        const wm = getWindowManager();
        wm.openWindow('failNoticeDialog').closed.then((data: any) => {
            if (data?.action === 'submit') {
                postFailNotice(`{{FailNotice|${data.value}}`)
                    .done(() => {
                        mw.notify('FailNotice 已发布');
                    })
                    .fail(() => {
                        mw.notify('FailNotice 发布失败', { type: 'error' });
                    });
            }
        });
    });

    const header = document.querySelector('.citizen-header__end');
    if (header) {
        header.appendChild(passButton);
        header.appendChild(failButton);
    }
})();

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

    const updateReviewPage = (status, note) => {
        const text = note ? `{{${status}|~~~~|note=${note}}}` : `{{${status}|~~~~}}`;

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
    const FailNoticeDialog = function (config) {
        FailNoticeDialog.super.call(this, config);
    };

    const D = FailNoticeDialog;

    OO.inheritClass(D, OO.ui.ProcessDialog);

    D.static.name = 'failNoticeDialog';
    D.static.title = '输入 FailNotice 内容';
    D.static.actions = [
        { action: 'submit', label: '发布', flags: ['primary'] },
        { action: 'cancel', label: '取消', flags: ['safe'] },
    ];

    D.prototype.initialize = function () {
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

    D.prototype.getSetupProcess = function (data) {
        return D.super.prototype.getSetupProcess.call(this, data).next(() => {
            this.textInput.setValue('');
        });
    };

    D.prototype.getActionProcess = function (action) {
        if (action === 'submit') {
            return new OO.ui.Process(function () {
                const value = this.textInput.getValue().trim();
                if (!value) {
                    throw new Error('请输入 FailNotice 内容');
                }
                this.close({ action: 'submit', value });
            }, this);
        }
        if (action === 'cancel') {
            return new OO.ui.Process(function () {
                this.close({ action: 'cancel' });
            }, this);
        }
        return D.super.prototype.getActionProcess.call(this, action);
    };

    // ---- Pending note dialog ----

    /**
     * Dialog for choosing the review direction for a pending status.
     */
    const PendingNoteDialog = function (config) {
        PendingNoteDialog.super.call(this, config);
    };

    const PendingDialog = PendingNoteDialog;

    OO.inheritClass(PendingDialog, OO.ui.ProcessDialog);

    PendingDialog.static.name = 'pendingNoteDialog';
    PendingDialog.static.title = '备注';
    PendingDialog.static.actions = [
        { action: 'pass', label: '偏向 Pass', flags: ['primary'] },
        { action: 'fail', label: '偏向 Fail', flags: ['destructive'] },
        { action: 'cancel', label: '取消', flags: ['safe'] },
    ];

    PendingDialog.prototype.initialize = function () {
        PendingDialog.super.prototype.initialize.call(this);
        this.content = new OO.ui.PanelLayout({ padded: true });
        this.content.$element.text('请选择 Pending 的审核倾向。');
        this.$body.append(this.content.$element);
    };

    PendingDialog.prototype.getBodyHeight = function () {
        return 100;
    };

    PendingDialog.prototype.getActionProcess = function (action) {
        if (action === 'pass' || action === 'fail') {
            return new OO.ui.Process(function () {
                this.close({
                    action: 'submit',
                    value: action === 'pass' ? 'Pass' : 'Fail',
                });
            }, this);
        }
        if (action === 'cancel') {
            return new OO.ui.Process(function () {
                this.close({ action: 'cancel' });
            }, this);
        }
        return PendingDialog.super.prototype.getActionProcess.call(this, action);
    };

    // ---- WindowManager singleton ----

    let windowManager = null;

    const getWindowManager = () => {
        if (!windowManager) {
            windowManager = new OO.ui.WindowManager();
            $(document.body).append(windowManager.$element);
            windowManager.addWindows([new FailNoticeDialog(), new PendingNoteDialog()]);
        }
        return windowManager;
    };

    // ---- CommentStreams API ----

    const postFailNotice = wikitext =>
        api.postWithToken('csrf', {
            action: 'cspostcomment',
            commenttitle: 'FailNotice',
            wikitext,
            associatedid: wgArticleId,
        });

    // ---- Query current review status ----

    const buttonText = (type, content) => {
        const templateName = type === 'Pend' ? 'Pending' : type;
        const regex = new RegExp(`\\{\\{\\s*${templateName}\\b`, 'iu');
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
    const pendingText = content ? buttonText('Pend', content) : 'Pend';

    // ---- Create buttons ----

    const reviewMenu = document.createElement('div');
    reviewMenu.classList.add('citizen-header__item', 'status-review-menu');

    const reviewMenuToggle = document.createElement('button');
    reviewMenuToggle.type = 'button';
    reviewMenuToggle.classList.add('citizen-header__button', 'citizen-button');
    reviewMenuToggle.classList.add('status-review-menu__toggle');
    reviewMenuToggle.textContent = '审核';
    reviewMenuToggle.setAttribute('aria-expanded', 'false');
    reviewMenuToggle.setAttribute('aria-haspopup', 'menu');

    const reviewMenuPopup = document.createElement('div');
    reviewMenuPopup.id = 'status-review-menu-popup';
    reviewMenuPopup.classList.add('status-review-menu__popup');
    reviewMenuPopup.setAttribute('role', 'menu');
    reviewMenuPopup.hidden = true;

    const menuButtons = [];
    let menuOpen = false;

    const positionReviewMenu = () => {
        const triggerRect = reviewMenuToggle.getBoundingClientRect();
        const menuRect = reviewMenuPopup.getBoundingClientRect();
        const gap = 4;
        const viewportPadding = 8;
        const opensUp =
            triggerRect.bottom + gap + menuRect.height > window.innerHeight &&
            triggerRect.top - gap - menuRect.height >= viewportPadding;
        const top = opensUp
            ? triggerRect.top - menuRect.height - gap
            : triggerRect.bottom + gap;
        const left = Math.min(
            Math.max(viewportPadding, triggerRect.right - menuRect.width),
            window.innerWidth - menuRect.width - viewportPadding,
        );

        reviewMenuPopup.style.top = `${Math.max(viewportPadding, top)}px`;
        reviewMenuPopup.style.left = `${Math.max(viewportPadding, left)}px`;
    };

    const closeReviewMenu = (restoreFocus = false) => {
        if (!menuOpen) {
            return;
        }

        menuOpen = false;
        reviewMenuPopup.hidden = true;
        reviewMenuToggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
        document.removeEventListener('keydown', handleMenuKeydown);
        window.removeEventListener('resize', positionReviewMenu);
        window.removeEventListener('scroll', positionReviewMenu, true);

        if (restoreFocus) {
            reviewMenuToggle.focus();
        }
    };

    const openReviewMenu = () => {
        if (menuOpen) {
            return;
        }

        menuOpen = true;
        reviewMenuPopup.hidden = false;
        reviewMenuToggle.setAttribute('aria-expanded', 'true');
        positionReviewMenu();
        document.addEventListener('pointerdown', closeOnOutsidePointerDown);
        document.addEventListener('keydown', handleMenuKeydown);
        window.addEventListener('resize', positionReviewMenu);
        window.addEventListener('scroll', positionReviewMenu, true);
        menuButtons[0]?.focus();
    };

    const toggleReviewMenu = () => {
        if (menuOpen) {
            closeReviewMenu(true);
        } else {
            openReviewMenu();
        }
    };

    const closeOnOutsidePointerDown = event => {
        if (
            !reviewMenu.contains(event.target) &&
            !reviewMenuPopup.contains(event.target)
        ) {
            closeReviewMenu();
        }
    };

    const handleMenuKeydown = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeReviewMenu(true);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const currentIndex = menuButtons.indexOf(document.activeElement);
            const offset = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (currentIndex + offset + menuButtons.length) % menuButtons.length;
            menuButtons[nextIndex]?.focus();
            return;
        }

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const index = event.key === 'Home' ? 0 : menuButtons.length - 1;
            menuButtons[index]?.focus();
        }
    };

    reviewMenuToggle.setAttribute('aria-controls', reviewMenuPopup.id);
    reviewMenuToggle.addEventListener('click', toggleReviewMenu);

    const addReviewAction = (button, action) => {
        button.addEventListener('click', () => {
            closeReviewMenu();
            action();
        });
        menuButtons.push(button);
        reviewMenuPopup.appendChild(button);
    };

    const createReviewAction = (text, action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('citizen-button', 'status-review-menu__button');
        button.innerHTML = text;
        addReviewAction(button, action);
    };

    createReviewAction(passText, () => updateReviewPage('Pass'));

    createReviewAction(failText, () => {
        updateReviewPage('Fail');

        const wm = getWindowManager();
        wm.openWindow('failNoticeDialog').closed.then(data => {
            if (data?.action === 'submit') {
                postFailNotice(`{{FailNotice|${data.value}}}`)
                    .done(() => {
                        mw.notify('FailNotice 已发布');
                    })
                    .fail(() => {
                        mw.notify('FailNotice 发布失败', { type: 'error' });
                    });
            }
        });
    });

    createReviewAction(pendingText, () => {
        const wm = getWindowManager();
        wm.openWindow('pendingNoteDialog').closed.then(data => {
            if (data?.action === 'submit' && (data.value === 'Pass' || data.value === 'Fail')) {
                updateReviewPage('Pending', data.value);
            }
        });
    });

    reviewMenu.appendChild(reviewMenuToggle);

    const header = document.querySelector('.citizen-header__end');
    if (header) {
        header.appendChild(reviewMenu);
        document.body.appendChild(reviewMenuPopup);
    }
})();

// 传奇动画库 Animate.css
mw.loader.load(
    'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
    'text/css'
);

// 代码高亮工具 Prism.js
// 站内页面需要用 action=raw 的原始内容地址加载
mw.loader.load(
    mw.config.get('wgScript') +
    '?title=' + encodeURIComponent('MediaWiki:Prism.js') +
    '&action=raw&ctype=text/javascript'
);

// Prism.css
mw.loader.load(
    mw.config.get('wgScript') +
    '?title=' + encodeURIComponent('MediaWiki:Prism.css') +
    '&action=raw&ctype=text/css',
    'text/css'
);

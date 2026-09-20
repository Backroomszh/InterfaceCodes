/* 小工具：让红链直接指向不存在的页面，而非创建页面 */
/* 依赖：jQuery (MediaWiki 默认加载) */
/* 兼容：MediaWiki 1.35+ */

mw.loader.using( 'jquery', function () {
    $( function () {
        // 选择所有带有 new 类的链接（即红链）
        $( 'a.new' ).each( function () {
            var $link = $( this );
            var originalHref = $link.attr( 'href' );

            // 如果没有 href 属性则跳过
            if ( !originalHref ) {
                return;
            }

            // 移除 action=edit 和 redlink=1 参数，使链接指向页面本身
            var newHref = originalHref
                .replace( /[?&]action=edit/, '' )    // 移除 action=edit
                .replace( /[?&]redlink=1/, '' )      // 移除 redlink=1
                .replace( /[?&]$/, '' )              // 清理末尾多余的 ? 或 &
                .replace( /[?&]{2,}/g, '&' );        // 合并连续的分隔符

            // 如果修改后的地址与原始地址不同，则更新 href
            if ( newHref !== originalHref ) {
                $link.attr( 'href', newHref );
            }

            // 可选：移除 title 属性中的“页面不存在”提示（根据需求决定是否保留）
            // 保留原有 title 更有利于用户体验，此处默认不修改
        } );
    } );
} );

/**
 * 在许可协议信息下方添加"举报该页面"按钮。
 * 举报对象为该页面的最新修订版本。
 * 仅在主命名空间显示，且排除包含特定分类的页面。
 */
( function () {
    'use strict';

    function addReportButton() {
        // 只在普通查看页面显示
        if ( mw.config.get( 'wgAction' ) !== 'view' ) {
            return;
        }

        // 只对主命名空间生效（命名空间 ID 为 0）
        if ( mw.config.get( 'wgNamespaceNumber' ) !== 0 ) {
            return;
        }

        // 排除包含特定分类的页面
        var categories = mw.config.get( 'wgCategories', [] );
        var excludedCategories = [ 'Category:索引', 'Category:功能性页面' ];
        
        for ( var i = 0; i < excludedCategories.length; i++ ) {
            if ( categories.indexOf( excludedCategories[i] ) !== -1 ) {
                return;
            }
        }

        var pageName = mw.config.get( 'wgPageName' );
        var curRevisionId = mw.config.get( 'wgCurRevisionId' );

        // 没有页面名或最新修订 ID 时不显示，例如特殊页面、不存在的页面
        if ( !pageName || !curRevisionId ) {
            return;
        }

        // 防止重复添加
        if ( document.getElementById( 'report-page-button' ) ) {
            return;
        }

        // Report 扩展常见的参数名是 target 和 revid
        var reportUrl = mw.util.getUrl( 'Special:Report', {
            target: pageName,
            revid: curRevisionId
        } );

        var $link = $( '<a>' )
            .attr( 'href', reportUrl )
            .text( '举报该页面' );

        // 创建包含按钮的容器，确保独立成行且靠右显示
        var $buttonContainer = $( '<div>' )
            .attr( 'id', 'report-page-button' )
            .css( {
                'text-align': 'right',
                'margin-top': '5px',
                'clear': 'both'
            } )
            .append( $link );

        // 优先放在版权/许可协议信息下方
        var $target = $( '#footer-info-copyright' );
        if ( $target.length ) {
            // 如果版权信息是 li 元素，我们需要在 ul 外面添加 div
            if ( $target.prop( 'tagName' ).toLowerCase() === 'li' ) {
                $target.closest( 'ul' ).after( $buttonContainer );
            } else {
                $target.after( $buttonContainer );
            }
            return;
        }

        // 备用位置：页脚信息容器
        $target = $( '#footer-info' );
        if ( $target.length ) {
            $target.after( $buttonContainer );
            return;
        }

        // 最终回退：放在页脚开头
        $target = $( '#footer' ).first();
        if ( $target.length ) {
            $target.prepend( $buttonContainer );
        }
    }

    $( function () {
        mw.loader.using( 'mediawiki.util' ).done( addReportButton );
    } );
}() );
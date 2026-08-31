/**
 * 在许可协议信息下方添加“举报该页面”按钮。
 * 举报对象为该页面的最新修订版本。
 */
( function () {
    'use strict';

    function addReportButton() {
        // 只在普通查看页面显示
        if ( mw.config.get( 'wgAction' ) !== 'view' ) {
            return;
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

        // 请根据你安装的 Report 扩展实际参数名调整：
        // 常见为 page/revision，也可能是 target/revid。
        var reportUrl = mw.util.getUrl( 'Special:Report', {
            page: pageName,
            revision: curRevisionId
        } );

        var $link = $( '<a>' )
            .attr( 'href', reportUrl )
            .text( '举报该页面' );

        function makeButton( tagName ) {
            return $( '<' + tagName + '>' )
                .attr( 'id', 'report-page-button' )
                .append( $link );
        }

        // 优先放在版权/许可协议信息下方
        var $target = $( '#footer-info-copyright' );
        if ( $target.length ) {
            var tagName = $target.prop( 'tagName' ).toLowerCase();
            $target.after( makeButton( tagName === 'li' ? 'li' : 'div' ) );
            return;
        }

        // 备用位置：最后修改信息下方或页脚信息容器
        $target = $( '#footer-info-lastmod, #footer-info' ).first();
        if ( $target.length ) {
            var fallbackTag = $target.prop( 'tagName' ).toLowerCase();

            if ( fallbackTag === 'ul' ) {
                $target.append( makeButton( 'li' ) );
            } else if ( fallbackTag === 'li' ) {
                $target.after( makeButton( 'li' ) );
            } else {
                $target.after( makeButton( 'div' ) );
            }
            return;
        }

        // 最终回退：放在页脚开头
        $target = $( '#footer' ).first();
        if ( $target.length ) {
            $target.prepend( makeButton( 'div' ) );
        }
    }

    $( function () {
        mw.loader.using( 'mediawiki.util' ).done( addReportButton );
    } );
}() );
/**
 * UserTitles gadget
 * 在用户页头部的用户组标签后追加自定义头衔。
 * 数据来源：MediaWiki:UserTitles.json
 */
( function () {
    'use strict';

    var DATA_PAGE = 'MediaWiki:UserTitles.json';
    var userTitles = {};

    function buildBadges( titles ) {
        return titles.map( function ( t ) {
            return '<span class="profile-user-group" data-group="' +
                mw.html.escape( t ) + '">' + mw.html.escape( t ) + '</span>';
        } ).join( '' );
    }

    function addTitles() {
        var $attrs = $( '.profile-header-attributes' );
        if ( !$attrs.length ) {
            return;
        }
        if ( $attrs.data( 'usertitles-added' ) ) {
            return;
        }

        var username = $attrs.find( 'h1' ).first().text().trim();
        if ( !username ) {
            return;
        }

        var titles = userTitles[ username ];
        if ( !titles || !titles.length ) {
            return;
        }

        var $lastGroup = $attrs.find( '.profile-user-group' ).last();
        if ( $lastGroup.length ) {
            $lastGroup.after( buildBadges( titles ) );
        } else {
            $attrs.find( 'h1' ).first().after( ' ' + buildBadges( titles ) );
        }
        $attrs.data( 'usertitles-added', true );
    }

    // 用户页是 AJAX 渲染的，钩子提前注册
    mw.hook( 'wikipage.content' ).add( addTitles );

    $( function () {
        new mw.Api().get( {
            action: 'query',
            titles: DATA_PAGE,
            prop: 'revisions',
            rvprop: 'content',
            formatversion: 2
        } ).done( function ( data ) {
            var page = data.query.pages[ 0 ];
            if ( !page || !page.revisions ) {
                console.warn( 'UserTitles: 数据页面不存在 →', DATA_PAGE );
                return;
            }
            try {
                userTitles = JSON.parse( page.revisions[ 0 ].content );
            } catch ( e ) {
                console.error( 'UserTitles: JSON 解析失败', e );
                return;
            }
            addTitles();
        } ).fail( function ( err ) {
            console.error( 'UserTitles: API 请求失败', err );
        } );
    } );

} )();
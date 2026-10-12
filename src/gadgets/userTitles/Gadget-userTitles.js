/**
 * UserTitles gadget
 * 在用户页头部的用户组标签后追加自定义头衔。
 * 数据来源：MediaWiki:UserTitles.json
 *
 * JSON 格式：
 *   {
 *     "用户名": [ "纯文本头衔", { "title": "头衔", "class": "自定义类名" } ]
 *   }
 */
( function () {
    'use strict';

    var DATA_PAGE = 'MediaWiki:UserTitles.json';
    var userTitles = {};

    // 只允许安全的类名片段
    var SAFE_CLASS = /^[A-Za-z0-9_-]+$/;

    /**
     * 把 JSON 里的条目统一成 { title, classes }
     * 兼容两种写法：
     *   "头衔文字"
     *   { title: "头衔文字", class: "a b" }
     */
    function normalize( list ) {
        if ( !Array.isArray( list ) ) {
            return [];
        }
        var out = [];
        list.forEach( function ( item ) {
            var title, extraClass;

            if ( typeof item === 'string' ) {
                title = item;
            } else if ( item && typeof item === 'object' ) {
                title = item.title;
                extraClass = item['class']; // class 是保留字，用中括号
            }

            if ( typeof title !== 'string' || !title.trim() ) {
                return;
            }

            var classes = String( extraClass || '' )
                .split( /\s+/ )
                .filter( function ( c ) {
                    return c && SAFE_CLASS.test( c );
                } );

            out.push( {
                title: title,
                classes: classes
            } );
        } );
        return out;
    }

    function buildBadges( titles ) {
        return titles.map( function ( t ) {
            var cls = 'profile-user-group';
            if ( t.classes.length ) {
                cls += ' ' + t.classes.join( ' ' );
            }

            return '<span class="' + mw.html.escape( cls ) + '"' +
                ' data-group="' + mw.html.escape( t.title ) + '">' +
                mw.html.escape( t.title ) + '</span>';
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

        var titles = normalize( userTitles[ username ] );
        if ( !titles.length ) {
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

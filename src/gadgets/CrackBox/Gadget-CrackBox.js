( function ( $, mw ) {
    'use strict';

    function initCrackWrappers( $content ) {
        var $wrappers = $content.find( '.crack-wrapper' );
        if ( !$wrappers.length ) return;

        $wrappers.each( function () {
            var $wrapper = $( this );
            if ( $wrapper.data( 'crack-init' ) ) return;
            $wrapper.data( 'crack-init', true );

            var num = $wrapper.attr( 'data-num' ) || '884817236';

            // DOM 元素
            var $box = $wrapper.find( '.crack-box' );
            var $body = $wrapper.find( '.crack-body' );
            var $startBtn = $box.find( '.start-btn' );
            var $terminalText = $box.find( '.terminal-text' );
            var $crackPanel = $box.find( '.crack-panel' );
            var $manualBtn = $box.find( '.manual-btn' );
            var $cells = $box.find( '.pw-cell' );
            var $timerFill = $box.find( '.timer-fill' );
            var $chipBg = $box.find( '.chip-bg' );
            var $resetFailBtn = $box.find( '.crack-reset-fail' );
            var $resetBodyBtn = $wrapper.find( '.crack-reset' );

            // 常量
            var PASSWORD = 'MWIKIPEDIA';
            var TOTAL_CLICKS = 24;
            var MANUAL_TIME = 15;
            var AUTO_STEPS = [
                { delay: 0, text: '已连接远程服务器，正在自动破解……' },
                { delay: 1000, text: '已计算所有可能性，正在排除' },
                { delay: 2500, text: '排除成功，剩余可能性开始尝试' },
                { delay: 4000, text: '远程服务器断开连接，请快速点击手动破解键以破解密码' }
            ];

            // 状态变量
            var state = 'idle';
            var clicks = 0;
            var correct = 0;
            var timerInterval = null;
            var manualTimeLeft = MANUAL_TIME;
            var autoTimers = [];

            // 重置状态
            function resetAll() {
                if ( timerInterval ) clearInterval( timerInterval );
                timerInterval = null;
                autoTimers.forEach( clearTimeout );
                autoTimers = [];
                clicks = 0;
                correct = 0;
                manualTimeLeft = MANUAL_TIME;
                state = 'idle';

                $cells.text('*').removeClass('correct');
                $timerFill.css('width', '100%').removeClass('warning danger');
                $chipBg.removeClass('success fail pulse');
                $manualBtn.addClass('disabled').text('💀 手动破解');
                $startBtn.removeClass('disabled').text('▶ 开始破解');
                $terminalText.empty();
                $crackPanel.hide();
                $resetFailBtn.hide();
                $box.show();
                $body.hide();
            }

            // 自动破解阶段
            function startAutoPhase() {
                state = 'auto';
                $startBtn.addClass('disabled');
                $terminalText.empty();
                $crackPanel.hide();

                AUTO_STEPS.forEach( function( step, index ) {
                    var timer = setTimeout( function() {
                        $terminalText.text( step.text );
                        if ( index === AUTO_STEPS.length - 1 ) {
                            setTimeout( function() {
                                $crackPanel.show();
                                $manualBtn.removeClass('disabled');
                                state = 'manual';
                                manualTimeLeft = MANUAL_TIME;
                                updateTimerBar();
                                if ( timerInterval ) clearInterval( timerInterval );
                                timerInterval = setInterval( function() {
                                    manualTimeLeft--;
                                    updateTimerBar();
                                    if ( manualTimeLeft <= 0 ) {
                                        failCrack();
                                    }
                                }, 1000 );
                            }, 700 );
                        }
                    }, step.delay );
                    autoTimers.push( timer );
                } );
            }

            function updateTimerBar() {
                var pct = ( manualTimeLeft / MANUAL_TIME ) * 100;
                $timerFill.css('width', pct + '%');
                if ( manualTimeLeft <= 3 ) {
                    $timerFill.addClass('danger').removeClass('warning');
                } else if ( manualTimeLeft <= 7 ) {
                    $timerFill.addClass('warning').removeClass('danger');
                } else {
                    $timerFill.removeClass('warning danger');
                }
            }

            function doCrackClick() {
                if ( state !== 'manual' ) return;
                if ( clicks >= TOTAL_CLICKS ) return;

                clicks++;
                var targetCorrect = Math.floor( clicks / 4 );
                if ( targetCorrect > correct ) {
                    correct++;
                    $cells.eq( correct - 1 )
                        .text( PASSWORD.charAt( correct - 1 ) )
                        .addClass('correct');
                } else {
                    var fakeChars = 'ABCDEFGH@#%&*!';
                    var r = fakeChars.charAt( Math.floor( Math.random() * fakeChars.length ) );
                    $cells.eq( correct ).text( r );
                }

                $chipBg.removeClass('pulse');
                void $chipBg[0].offsetWidth;
                $chipBg.addClass('pulse');

                if ( correct >= 6 ) {
                    successCrack();
                }
            }

            function successCrack() {
                if ( state === 'success' ) return;
                state = 'success';
                if ( timerInterval ) clearInterval( timerInterval );
                $manualBtn.addClass('disabled');
                $terminalText.text('破解成功');
                $chipBg.addClass('success').removeClass('fail pulse');
                $timerFill.css('width', '100%').removeClass('warning danger');
                setTimeout( function() {
                    // 展开 body 内容（内含重置按钮）
                    $box.hide();
                    $body.show();
                }, 1200 );
            }

            function failCrack() {
                if ( state === 'fail' ) return;
                state = 'fail';
                if ( timerInterval ) clearInterval( timerInterval );
                $manualBtn.addClass('disabled');
                $terminalText.text('验证错误，拒绝访问');
                $chipBg.addClass('fail').removeClass('success pulse');
                // 显示重置按钮
                $resetFailBtn.show();
            }

            // 事件绑定
            $startBtn.on( 'click', function( e ) {
                e.stopPropagation();
                if ( state !== 'idle' ) return;
                startAutoPhase();
            } );

            $manualBtn.on( 'click', function( e ) {
                e.stopPropagation();
                if ( $(this).hasClass('disabled') ) return;
                doCrackClick();
            } );

            // 失败重置按钮
            $resetFailBtn.on( 'click', function( e ) {
                e.stopPropagation();
                resetAll();
            } );

            // body 内的重置按钮
            $resetBodyBtn.on( 'click', function( e ) {
                e.stopPropagation();
                resetAll();
            } );

            // 初始状态
            resetAll();
        } );
    }

    mw.hook( 'wikipage.content' ).add( function ( $content ) {
        initCrackWrappers( $content );
    } );

    $( function () {
        initCrackWrappers( $( document ) );
    } );

} )( jQuery, mediaWiki );

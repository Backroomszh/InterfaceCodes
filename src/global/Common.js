/*
 * Script Name: Template CSS
 * Author: Fandom Backrooms
 */
(function () {
    const eles = document.querySelectorAll('.js-action-play');
    eles.forEach(function (e) {
        const targetId = e.getAttribute('data-media-id');
        if (!targetId) {
            console.error('No data-media-id present on element', e);
            return;
        }
        const target = document.getElementsByClassName('media-id-' + targetId)[0];
        if (!target) {
            console.error('No element found with .media-id-' + targetId, e);
            return;
        }
        e.addEventListener('click', function () {
            console.log(target);
            if (target.paused || target.ended) {
                target.play();
            } else {
                target.pause();
            }
        });
    });
})();

mw.loader.load(['mediawiki.util', 'mediawiki.Title']);
mw.hook('wikipage.content').add(function () {
    $('span.import-css').each(function () {
        mw.util.addCSS($(this).attr('data-css'));
    });

    $('.sitenotice-tab-container').each(function () {
        var container = $(this);
        var switchTab = function (offset) {
            return function () {
                var tabs = container.children('.sitenotice-tab').toArray();
                var no = Number(container.find('.sitenotice-tab-no')[0].innerText) + offset;
                var count = tabs.length;
                if (no < 1) {
                    no = count;
                } else if (no > count) {
                    no = 1;
                }
                for (var i = 0; i < count; i++) {
                    tabs[i].style.display = i + 1 === no ? null : 'none';
                }
                container.find('.sitenotice-tab-no')[0].innerText = no;
            };
        };
        container.find('.sitenotice-tab-arrow.prev').click(switchTab(-1));
        container.find('.sitenotice-tab-arrow.next').click(switchTab(1));
    });
});


mw.loader.load(
    'https://wiki.backroomszh.org/w/index.php?title=MediaWiki:Audio.js&action=raw&ctype=text/javascript',
); //Import audio script

/*
 * 如果再给我一次重新写的机会
 * 我一定不会再写出如此春虫虫的代码
 * BY：丩卩夂忄
 */
var TimerNumber = document.getElementsByClassName('TimerNumber');
var TimerNumbers = [];
for (var i = 0; i < TimerNumber.length; i++) {
    TimerNumbers = TimerNumber[i].innerHTML;
}
TimerNumber = Math.max(TimerNumbers);
var TimerZone = new Date().getTimezoneOffset() / 60;
var TimerOffset = (8 + TimerZone) * 60 * 60 * 1000;
var Timers = [];
var TimerEndTimes = [];
var TimerPMrs = [];
var TimerDays = [];
var TimerHours = [];
var TimerMinutes = [];
var TimerSeconds = [];

for (var CountTimers = 0; CountTimers <= TimerNumber; CountTimers++) {
    Timers[CountTimers] = document.getElementById('Timer' + CountTimers);
    if (!Timers[CountTimers]) {
        continue;
    }
    TimerEndTimes[CountTimers] = document.getElementById('TimerEndTime' + CountTimers);
    TimerPMrs[CountTimers] = document.getElementById('TimerPMr' + CountTimers);
    TimerDays[CountTimers] = document.getElementById('TimerDay' + CountTimers);
    TimerHours[CountTimers] = document.getElementById('TimerHour' + CountTimers);
    TimerMinutes[CountTimers] = document.getElementById('TimerMinute' + CountTimers);
    TimerSeconds[CountTimers] = document.getElementById('TimerSecond' + CountTimers);
    document.getElementById('TimerPMl' + CountTimers).innerHTML = '距离';
    Timers[CountTimers].style.display = '';
}
var TimerRun = function () {
    for (var CountTimers = 0; CountTimers <= TimerNumber; CountTimers++) {
        if (!Timers[CountTimers]) {
            continue;
        }
        var TimerEndTime = new Date(TimerEndTimes[CountTimers].innerHTML);
        var TimerNowTime = new Date();
        var TimerDifference = TimerEndTime.getTime() - TimerNowTime.getTime() - TimerOffset;
        var TimerDay, TimerHour, TimerMinute, TimerSecond;
        if (TimerDifference < 0) {
            TimerDay = Math.abs(Math.ceil(TimerDifference / 1000 / 60 / 60 / 24));
            TimerHour = Math.abs(Math.ceil((TimerDifference / 1000 / 60 / 60) % 24));
            TimerMinute = Math.abs(Math.ceil((TimerDifference / 1000 / 60) % 60));
            TimerSecond = Math.abs(Math.ceil((TimerDifference / 1000) % 60));
            TimerPMrs[CountTimers].innerHTML = '已经过去';
        } else {
            TimerDifference += 1000;
            TimerDay = Math.abs(Math.floor(TimerDifference / 1000 / 60 / 60 / 24));
            TimerHour = Math.abs(Math.floor((TimerDifference / 1000 / 60 / 60) % 24));
            TimerMinute = Math.abs(Math.floor((TimerDifference / 1000 / 60) % 60));
            TimerSecond = Math.abs(Math.floor((TimerDifference / 1000) % 60));
            TimerPMrs[CountTimers].innerHTML = '还有';
        }
        TimerDays[CountTimers].innerHTML = TimerDay + '天';
        TimerHours[CountTimers].innerHTML = TimerHour + '时';
        TimerMinutes[CountTimers].innerHTML = TimerMinute + '分';
        TimerSeconds[CountTimers].innerHTML = TimerSecond + '秒';
    }
};
setInterval(TimerRun, 0);

/**
 * MediaWiki 自动播放图片幻灯片脚本
 * 使用方法：将此脚本添加到 MediaWiki:Common.js 或个人的 User:用户名/common.js
 */

var initSlideshow = function ($container) {
    var slides = $container.find('.slide');
    var totalSlides = slides.length;

    if (totalSlides === 0) {
        return;
    }

    var currentSlide = 0;
    var autoplayInterval;
    var isPaused = false;

    // 获取配置参数
    var autoplayDelay = parseInt($container.data('delay')) || 3000;
    var showControls = $container.data('controls') !== 'false';
    var showIndicators = $container.data('indicators') !== 'false';
    var fadeEffect = $container.data('fade') !== 'false';

    // 创建控制按钮
    if (showControls) {
        var controlsHtml =
            '<div class="slideshow-controls">' +
            '<button class="btn-prev" title="上一张">‹</button>' +
            '<button class="btn-play-pause" title="播放/暂停">⏸</button>' +
            '<button class="btn-next" title="下一张">›</button>' +
            '</div>';
        $container.append(controlsHtml);
    }

    // 创建指示器
    if (showIndicators && totalSlides > 1) {
        var indicatorsHtml = '<div class="slideshow-indicators">';
        for (var i = 0; i < totalSlides; i++) {
            indicatorsHtml +=
                '<span class="indicator' +
                (i === 0 ? ' active' : '') +
                '" data-slide="' +
                i +
                '"></span>';
        }
        indicatorsHtml += '</div>';
        $container.append(indicatorsHtml);
    }

    // 初始化样式
    slides.hide();
    $(slides[0]).show().addClass('active');

    // 显示当前幻灯片
    var showSlide = function (index) {
        slides.removeClass('active');
        $container.find('.indicator').removeClass('active');

        if (fadeEffect) {
            slides.fadeOut(300, function () {
                $(slides[index]).fadeIn(300).addClass('active');
            });
        } else {
            slides.hide();
            $(slides[index]).show().addClass('active');
        }

        $container.find('.indicator').eq(index).addClass('active');
        currentSlide = index;
    };

    // 下一张
    var nextSlide = function () {
        var next = (currentSlide + 1) % totalSlides;
        showSlide(next);
    };

    // 上一张
    var prevSlide = function () {
        var prev = (currentSlide - 1 + totalSlides) % totalSlides;
        showSlide(prev);
    };

    // 开始自动播放
    var startAutoplay = function () {
        if (totalSlides > 1) {
            autoplayInterval = setInterval(nextSlide, autoplayDelay);
            isPaused = false;
            $container.find('.btn-play-pause').text('⏸').attr('title', '暂停');
        }
    };

    // 停止自动播放
    var stopAutoplay = function () {
        clearInterval(autoplayInterval);
        isPaused = true;
        $container.find('.btn-play-pause').text('▶').attr('title', '播放');
    };

    // 控制按钮事件
    $container.on('click', '.btn-prev', function (e) {
        e.preventDefault();
        prevSlide();
        if (!isPaused) {
            stopAutoplay();
            startAutoplay(); // 重置计时器
        }
    });

    $container.on('click', '.btn-next', function (e) {
        e.preventDefault();
        nextSlide();
        if (!isPaused) {
            stopAutoplay();
            startAutoplay(); // 重置计时器
        }
    });

    $container.on('click', '.btn-play-pause', function (e) {
        e.preventDefault();
        if (isPaused) {
            startAutoplay();
        } else {
            stopAutoplay();
        }
    });

    // 指示器点击事件
    $container.on('click', '.indicator', function (e) {
        e.preventDefault();
        var slideIndex = parseInt($(this).data('slide'));
        showSlide(slideIndex);
        if (!isPaused) {
            stopAutoplay();
            startAutoplay(); // 重置计时器
        }
    });

    // 鼠标悬停暂停
    $container.hover(
        function () {
            if (!isPaused) {
                clearInterval(autoplayInterval);
            }
        },
        function () {
            if (!isPaused) {
                autoplayInterval = setInterval(nextSlide, autoplayDelay);
            }
        },
    );

    // 键盘控制
    $(document).on('keydown', function (e) {
        if ($container.is(':visible')) {
            switch (e.keyCode) {
                case 37: // 左箭头
                    prevSlide();
                    e.preventDefault();
                    break;
                case 39: // 右箭头
                    nextSlide();
                    e.preventDefault();
                    break;
                case 32: // 空格键
                    if (isPaused) {
                        startAutoplay();
                    } else {
                        stopAutoplay();
                    }
                    e.preventDefault();
                    break;
            }
        }
    });

    // 开始自动播放
    startAutoplay();
};

$(document).ready(function () {
    // 初始化所有幻灯片
    $('.mw-slideshow').each(function () {
        initSlideshow($(this));
    });
});
importScript('User:Czz4188/Import.js');

/**
 * 后室中文数据库自定义脚本添加
 * by Corn Pig
/
/**
 * 自动加载并执行 Script:<当前页面名>
 *
 * 例：页面 "Foo"        → 加载 MediaWiki:CustomScripts-Foo
 *     页面 "Help:Bar"  → 加载 MediaWiki:CustomScripts-Help:Bar
 *
 */
( function () {
    'use strict';

    var config = mw.config;

    // 1. 只在正常浏览页面时执行（编辑 / 预览 / diff / 历史等不执行）
    var action = config.get( 'wgAction' );
    if ( action !== 'view' && action !== 'purge' ) {
        return;
    }

    // 2. 取当前页面名（带下划线的 URL 安全形式，如 "Main_Page"）
    var pageName = config.get( 'wgPageName' );
    if ( !pageName ) {
        return;
    }

    // 3. 防止在 Script: 命名空间内自我递归加载
    if ( pageName.indexOf( 'Script:' ) === 0 ) {
        return;
    }

    // 4. （可选）只对主命名空间生效，去掉注释即可启用
    // if ( config.get( 'wgNamespaceNumber' ) !== 0 ) {
    //     return;
    // }

    var scriptTitle = 'MediaWiki:CustomScripts-' + pageName;

    // 5. 用 mw.util.getUrl 生成 action=raw 的 URL 并加载执行
    var url = mw.util.getUrl( scriptTitle, {
        action: 'raw',
        ctype: 'text/javascript'
    } );

    mw.loader.load( url );
}() );

// </nowiki>

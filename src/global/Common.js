/*
 * Script Name: Template CSS
 * Author: Fandom Backrooms(CC BY-SA 4.0 International)
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
 * by Corn Pig、Qiuxi？
/
/**
 * 自动加载并执行自定义JS
 */
/**
 * {{JS}} 模板支持：
 *   {{JS|页面名}}         → 按页面名引入并执行
 *   {{JS|content=代码}}   → 内联执行代码
 *
 * 对应元素：
 *   <span class="mw-js" data-page="页面名"></span>
 *   <span class="mw-js" data-inline="1">代码</span>
 */
"use strict";
(function () {
    var loaded = Object.create(null);
    var failed = Object.create(null);
    var queue = Promise.resolve();
    var api;
    var inlineSeq = 0;

    function normalizeTitle(raw) {
        if (raw == null) return "";
        return String(raw).replace(/_/g, " ").replace(/\s+/g, " ").trim();
    }

    function isSaneTitle(t) {
        return !!t && !/^\/\//.test(t) && !/^[a-z][a-z0-9+.\-]*:\/\//i.test(t);
    }

    function fetchCode(title) {
        return api.get({
            action: "query",
            prop: "revisions",
            rvprop: "content",
            rvslots: "main",
            rvlimit: 1,
            titles: title,
            formatversion: 2,
            errorformat: "plaintext"
        }).then(function (data) {
            var page = data.query && data.query.pages && data.query.pages[0];
            if (!page) throw new Error("API 未返回任何页面");
            if (page.invalid) throw new Error("页面名无效：" + page.invalid);
            if (page.missing) throw new Error("页面不存在：" + title);
            var slot = page.revisions && page.revisions[0] &&
                       page.revisions[0].slots && page.revisions[0].slots.main;
            if (!slot || typeof slot.content !== "string") {
                throw new Error("无法读取源码：" + title);
            }
            return slot.content;
        });
    }

    // 在全局作用域执行脚本；sourceLabel 用于生成 sourceURL，方便 DevTools 定位
    function runCode(code, sourceLabel) {
        var url;
        if (sourceLabel && /^https?:/i.test(sourceLabel)) {
            url = sourceLabel;
        } else if (sourceLabel) {
            url = mw.util.getUrl(sourceLabel);
        } else {
            url = mw.util.getUrl(mw.config.get("wgPageName")) +
                  "#inline-js-" + (++inlineSeq);
        }
        (0, eval)(code + "\n//# sourceURL=" + url + "\n");
    }

    // 模式二：按页面名加载
    function loadPage(title) {
        if (loaded[title] || failed[title]) return Promise.resolve(title);

        var job = queue.then(function () {
            if (loaded[title] || failed[title]) return title;
            return fetchCode(title).then(function (code) {
                runCode(code, title);
                loaded[title] = true;
                return title;
            }, function (err) {
                failed[title] = true;
                mw.log.error("[JS] 载入 " + title + " 失败：", err);
                throw err;
            });
        });

        queue = job.then(null, function () {});
        return job;
    }

    // 模式一：内联执行
    function runInline(code) {
        var job = queue.then(function () {
            try {
                runCode(code, null);
            } catch (e) {
                mw.log.error("[JS] 内联脚本执行失败：", e);
                throw e;
            }
        });
        queue = job.then(null, function () {});
        return job;
    }

    function processEl(el) {
        var $el = $(el);
        if ($el.data("mwjs")) return;   // 幂等
        $el.data("mwjs", true);

        // —— 内联模式 ——
        if ($el.attr("data-inline") !== undefined) {
            var code = el.textContent || "";
            if (!code.trim()) {
                $el.attr("data-js-status", "empty");
                return;
            }
            $el.attr("data-js-status", "loading");
            runInline(code).then(function () {
                $el.attr("data-js-status", "loaded");
            }, function () {
                $el.attr("data-js-status", "error");
            });
            return;
        }

        // —— 页面名模式 ——
        var title = normalizeTitle($el.attr("data-page") || $el.attr("data-title") || "");
        if (!isSaneTitle(title)) {
            mw.log.warn("[JS] 页面名非法，已忽略：", title);
            $el.attr("data-js-status", "invalid");
            return;
        }
        $el.attr("data-js-status", "loading");
        loadPage(title).then(function () {
            $el.attr("data-js-status", "loaded");
        }, function () {
            $el.attr("data-js-status", "error");
        });
    }

    function scan($root) {
        var $els = $root.find(".mw-js, .mw-js-import");
        if ($root.is(".mw-js, .mw-js-import")) $els = $els.add($root);
        $els.each(function () { processEl(this); });
    }

    $(function () {
        mw.loader.using(["mediawiki.api", "mediawiki.util"]).then(function () {
            api = new mw.Api();
            mw.hook("wikipage.content").add(scan);   // 首屏 + 编辑预览 + AJAX 加载
            scan($(document.body));
        });
    });
})();

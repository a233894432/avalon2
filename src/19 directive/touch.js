new function () {// jshint ignore:line
    var touchProxy = {}
    var IEtouch = navigator.pointerEnabled
    var IEMStouch = navigator.msPointerEnabled
    var ua = navigator.userAgent
    var isAndroid = ua.indexOf("Android") > 0
    var platform = navigator.platform
    var isPC = platform.indexOf('Mac') === 0 || platform.indexOf('Win') === 0 || (platform.indexOf('linux') === 0 && !isAndroid);
    var isGoingtoFixTouchEndEvent = isAndroid && ua.match(/Firefox|Opera/gi)
    //合成做成触屏事件所需要的各种原生事件
    var touchNames = ["touchstart", "touchmove", "touchend", "touchcancel"]
    var touchTimeout = null
    var longTapTimeout = null
    var dragDistance = 30
    var clickDuration = 750 //小于750ms是点击，长于它是长按或拖动
    var me = onDir

    if (IEtouch) {
        touchNames = ["pointerdown", "pointermove", "pointerup", "pointercancel"]
    }
    if (IEMStouch) {
        touchNames = ["MSPointerDown", "MSPointerMove", "MSPointerUp", "MSPointerCancel"]
    }
    function isPrimaryTouch(event) {
        return (event.pointerType === 'touch' || event.pointerType === event.MSPOINTER_TYPE_TOUCH) && event.isPrimary
    }

    function isPointerEventType(e, type) {
        return (e.type === 'pointer' + type || e.type.toLowerCase() === 'mspointer' + type)
    }

    //判定滑动方向
    function swipeDirection(x1, x2, y1, y2) {
        return Math.abs(x1 - x2) >=
                Math.abs(y1 - y2) ? (x1 - x2 > 0 ? "left" : "right") : (y1 - y2 > 0 ? "up" : "down")
    }

    function fireEvent(el, name, detail) {
        var event = document.createEvent("Events")
        event.initEvent(name, true, true)
        if (detail) {
            event.detail = detail
        }
        el.dispatchEvent(event)
    }
    function needsClick(target) {
        switch (target.nodeName.toLowerCase()) {
            // Don't send a synthetic click to disabled inputs (issue #62)
            case 'button':
            case 'select':
            case 'textarea':
                if (target.disabled) {
                    return true;
                }

                break;
            case 'input':

                // File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
                if ((isAndroid && target.type === 'file') || target.disabled) {
                    return true;
                }

                break;
            case 'label':
            case 'iframe': // iOS8 homescreen apps can prevent events bubbling into frames
            case 'video':
                return true;
        }

        return (/\bneedsclick\b/).test(target.className);
    }
    ;
    function onMouse(event) {
        var target = event.target


        if (!needsClick(target) || touchProxy.cancelNextClick) {

            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation()
            } else {
                event.propagationStopped = true
            }
            event.stopPropagation()
            event.preventDefault()
        }
    }
    function cancelLongTap() {
        if (longTapTimeout)
            clearTimeout(longTapTimeout)
        longTapTimeout = null
    }
    function touchstart(event) {
        var _isPointerType = isPointerEventType(event, "down"),
                firstTouch = _isPointerType ? event : event.touches[0],
                element = "tagName" in firstTouch.target ? firstTouch.target : firstTouch.target.parentNode,
                now = Date.now(),
                delta = now - (touchProxy.last || now)

        if (_isPointerType && !isPrimaryTouch(event))
            return
        if (touchProxy.x1 || touchProxy.y1) {
            touchProxy.x1 = undefined
            touchProxy.y1 = undefined
        }
        if (delta > 0 && delta <= 250) {
            touchProxy.isDoubleTap = true
        }
        touchProxy.x = firstTouch.pageX
        touchProxy.y = firstTouch.pageY
        touchProxy.mx = 0
        touchProxy.my = 0
        touchProxy.last = now
        touchProxy.element = element

        longTapTimeout = setTimeout(function () {
            longTapTimeout = null
            fireEvent(element, "hold")
            fireEvent(element, "longtap")
            touchProxy = {}
        }, clickDuration)
        return true
    }
    function touchmove(event) {

        var _isPointerType = isPointerEventType(event, 'down'),
                firstTouch = _isPointerType ? event : event.touches[0],
                x = firstTouch.pageX,
                y = firstTouch.pageY
        if (_isPointerType && !isPrimaryTouch(event))
            return
        /*
         android下某些浏览器触发了touchmove事件的话touchend事件不触发，禁用touchmove可以解决此bug
         http://stackoverflow.com/questions/14486804/understanding-touch-events
         */
        if (isGoingtoFixTouchEndEvent && Math.abs(touchProxy.x - x) > 10) {
            event.preventDefault()
        }
        cancelLongTap()

        touchProxy.x1 = x // touchend事件没有pageX、pageY始终为0，且没有clientX和clientY事件
        touchProxy.y1 = y
        touchProxy.mx += Math.abs(touchProxy.x - x)
        touchProxy.my += Math.abs(touchProxy.y - y)
    }
    function touchend(event) {


        //如果点得太快,直接忽略 
        if ((event.timeStamp - touchProxy.lastClickTime) < 200) {
            touchProxy.cancelNextClick = true;
            return true;
        }
        touchProxy.cancelNextClick = false;

        touchProxy.lastClickTime = event.timeStamp;
        var _isPointerType = isPointerEventType(event, 'down'),
                element = touchProxy.element

        if (_isPointerType && !isPrimaryTouch(event))
            return
        if (!element)
            return // longtap|hold触发后touchProxy为{}

        cancelLongTap()
        if ((touchProxy.x1 && Math.abs(touchProxy.x1 - touchProxy.x) > dragDistance) || (touchProxy.y1 && Math.abs(touchProxy.y1 - touchProxy.y) > dragDistance)) {
            //如果用户滑动的距离有点大，就认为是swipe事件
            var direction = swipeDirection(touchProxy.x, touchProxy.x1, touchProxy.y, touchProxy.y1)
            var details = {
                direction: direction
            }
            fireEvent(element, "swipe", details)
            fireEvent(element, "swipe" + direction, details)
            touchProxy = {}
        } else {
            if (touchProxy.mx < dragDistance && touchProxy.my < dragDistance) {
                fireEvent(element, 'tap')
                if (touchProxy.isDoubleTap) {
                    fireEvent(element, "doubletap")
                    touchProxy = {}
                    touchProxy.element = element
                } else {
                    touchTimeout = setTimeout(function () {
                        clearTimeout(touchTimeout)
                        touchTimeout = null
                        if (touchProxy.element)
                            fireEvent(touchProxy.element, "singletap")
                        touchProxy = {};
                        touchProxy.element = element
                    }, 250)
                }
            } else {
                touchProxy = {}
            }
        }
    }
    if (isAndroid && touchNames[0] !== "mousedown") {
        document.addEventListener('mousedown', onMouse, true)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener(touchNames[0], touchstart)//按下
    document.addEventListener(touchNames[1], touchmove) //滑动
    document.addEventListener(touchNames[2], touchend)  //弹起
    if (touchNames[3]) {                                //系统自动取消
        document.addEventListener(touchNames[3], function (event) {
            if (longTapTimeout)
                clearTimeout(longTapTimeout)
            if (touchTimeout)
                clearTimeout(touchTimeout)
            longTapTimeout = touchTimeout = null
            touchProxy = {}
        })
    }
    ["swipe", "swipeleft", "swiperight", "swipeup", "swipedown", "doubletap", "tap", "longtap"].forEach(function (method) {
        me[method + "Hook"] = me["clickHook"]
    })

    //各种摸屏事件的示意图 http://quojs.tapquo.com/  http://touch.code.baidu.com/
}// jshint ignore:line
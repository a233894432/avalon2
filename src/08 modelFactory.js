//avalon最核心的方法的两个方法之一（另一个是avalon.scan），返回一个ViewModel(VM)
var VMODELS = avalon.vmodels = {} //所有vmodel都储存在这里
avalon.define = function (id, factory) {
    var $id = id.$id || id
    if (!$id) {
        log("warning: vm必须指定$id")
    }
    if (VMODELS[$id]) {
        log("warning: " + $id + " 已经存在于avalon.vmodels中")
    }
    if (typeof id === "object") {
        var model = modelFactory(id)
    } else {
        var scope = {
            $watch: noop
        }
        factory(scope) //得到所有定义

        model = modelFactory(scope) //偷天换日，将scope换为model
        stopRepeatAssign = true
        factory(model)
        stopRepeatAssign = false
    }
    //   if (kernel.newWatch) {
    model.$$watch = $watch
    //   }
    model.$id = $id
    return VMODELS[$id] = model
}

//一些不需要被监听的属性
var $$skipArray = oneObject("$id,$watch,$unwatch,$fire,$events,$model,$skipArray,$active,$track,$accessors")
var defineProperty = Object.defineProperty
var canHideOwn = true
//如果浏览器不支持ecma262v5的Object.defineProperties或者存在BUG，比如IE8
//标准浏览器使用__defineGetter__, __defineSetter__实现
try {
    defineProperty({}, "_", {
        value: "x"
    })
    var defineProperties = Object.defineProperties
} catch (e) {
    canHideOwn = false
}

function modelFactory(source, $special) {
    return observeObject(source, $special)
}

//监听对象属性值的变化(注意,数组元素不是数组的属性),通过对劫持当前对象的访问器实现
//监听对象或数组的结构变化, 对对象的键值对进行增删重排, 或对数组的进行增删重排,都属于这范畴
//   通过比较前后代理VM顺序实现
function Component() {
}
function observeObject(source, $special, old) {
    if (!source || source.nodeType > 0 || (source.$id && source.$events)) {
        return source
    }

    $special = $special || nullObject

    var $skipArray = {}
    if (source.$skipArray) {
        $skipArray = oneObject(source.$skipArray)
        delete source.$skipArray
    }


    var oldAccessors = old ? old.$accessors : nullObject
    var $vmodel = new Component() //要返回的对象, 它在IE6-8下可能被偷龙转凤
    var accessors = {} //监控属性
    var hasOwn = {}
    var skip = []
    var simple = []
    var $events = {}

    //处理计算属性
    var computed = source.$computed
    if (computed) {
        delete source.$computed
        for (var name in computed) {
            hasOwn[name] = true;
            (function (key, value) {
                var old
                accessors[key] = {
                    get: function () {
                        return old = value.get.call(this)
                    },
                    set: function (x) {
                        if (!stopRepeatAssign && typeof value.set === "function") {
                            var older = old
                            value.set.call(this, x)
                            var newer = this[key]
                            if (this.$fire && (newer !== older)) {
                                this.$fire(key, newer, older)
                            }
                        }
                    },
                    enumerable: true,
                    configurable: true
                }
            })(name, computed[name])
        }
    }


    for (name in source) {
        var value = source[name]
        if (!$$skipArray[name])
            hasOwn[name] = true
        if (!$special[name] && (name.charAt(0) === "$" || $$skipArray[name] || $skipArray[name] ||
                typeof value === "function" || (value && value.nodeType))) {
            skip.push(name)
        } else {
            simple.push(name)
            if (oldAccessors[name]) {
                $events[name] = old.$events[name]
                accessors[name] = oldAccessors[name]
            } else {
                $events[name] = []
                accessors[name] = makeGetSet(name, value, $events[name])
            }
        }
    }

    /* jshint ignore:end */
    accessors["$model"] = $modelDescriptor
    $vmodel = defineProperties($vmodel, accessors, source)
    function trackBy(name) {
        return hasOwn[name] === true
    }


    skip.forEach(function (name) {
        $vmodel[name] = source[name]
    })

    if (old) {
        old.$events = {}
    }
    /* jshint ignore:start */
    hideProperty($vmodel, "hasOwnProperty", trackBy)
    /* jshint ignore:end */
    hideProperty($vmodel, "$active", true)
    hideProperty($vmodel, "$events", $events)
    hideProperty($vmodel, "$track", Object.keys(hasOwn))
    hideProperty($vmodel, "$accessors", accessors)
    hideProperty($vmodel, "$id", "anonymous")
    addOldEventMethod($vmodel)

    //必须设置了$active,$events
    simple.forEach(function (name) {
        $vmodel[name] = source[name]
    })
    for (name in computed) {
        value = $vmodel[name]
    }

    return $vmodel
} 

function observeArray(array, old) {
    if (old) {
        var args = [0, old.length].concat(array)
        old.splice.apply(old, args)
        return old
    } else {
        for (var i in newProto) {
            array[i] = newProto[i]
        }

        hideProperty(array, "$events", {})
        hideProperty(array, "$active", true)
        hideProperty(array, "$track", createTrack(array.length))
        array.$events[subscribers] = []
        addOldEventMethod(array)

        array._ = observeObject({
            length: NaN
        })
        array._.length = array.length
        array._.$watch("length", function (a, b) {
            array.$fire("length", a, b)
        })

        if (W3C) {
            Object.defineProperty(array, "$model", $modelDescriptor)
        } else {
            array.$model = toJson(array)
        }

        for (var j = 0, n = array.length; j < n; j++) {
            array[j] = observe(array[j], 0, 1)
        }

        return array
    }
}

function observe(obj, old, hasReturn) {
    if (Array.isArray(obj)) {
        return observeArray(obj, old)
    } else if (avalon.isPlainObject(obj)) {
        if (old) {
//            if (canHideOwn) {
//                var $events = old.$events
//                var accessors = old.$accessors
//                for (var name in obj) {
//                    if (old.hasOwnProperty(i)) {
//                        old[name] = obj[name]
//                    } else {//如果添加了新属性
//                        $events[name] = []
//                        accessors[name] = makeGetSet(name, obj[name], $events[name])
//                        Object.defineProperty(name, accessors[name])
//                    }
//                }
//                for (name in old) {
//                    if (!obj.hasOwnProperty(name)) {
//                        delete $events[name]
//                        delete accessors[name]
//                        delete old[name]
//                    }
//                }
//                return old
//            } else {
                var keys = Object.keys(obj)
                var keys2 = Object.keys(old)
                if (keys.join(";") === keys2.join(";")) {
                    for (var i in obj) {
                        if (obj.hasOwnProperty(i)) {
                            //0.6 版本   var hack = old[i]
                            old[i] = obj[i]
                        }
                    }
                    return old
                }
                old.$active = false
//            }
        }
        return observeObject(obj, null, old)
    }
    if (hasReturn) {
        return obj
    }
}
function makeGetSet(key, value, list) {
    var childVm = observe(value)//转换为VM
    if (childVm) {
        value = childVm
        value.$events[subscribers] = list
    }
    return {
        get: function () {
            if (this.$active) {
                collectDependency(this.$events[key])
            }
            return value
        },
        set: function (newVal) {
            if (value === newVal || stopRepeatAssign)
                return
            var _value = value
            //var oldValue = toJson(value)
            var newVm = observe(newVal, value)

            if (newVm) {

                value = newVm
                //testVM.$events.a === testVM.a.$events[avalon.subscribers]
                value.$events[subscribers] = list
            } else {
                value = newVal
            }
            if (this.$fire) {
                notifySubscribers(this.$events[key], key, this)
                this.$fire(key, value, toJson(_value))
            }

        },
        enumerable: true,
        configurable: true
    }
}

function isObservable(name, value, $skipArray, $special) {

    if (isFunction(value) || value && value.nodeType) {
        return false
    }
    if ($skipArray.indexOf(name) !== -1) {
        return false
    }
    if (name && name.charAt(0) === "$" && !$special[name]) {
        return false
    }
    return true
}

function hideProperty(host, name, value) {
    if (canHideOwn) {
        Object.defineProperty(host, name, {
            value: value,
            writable: true,
            enumerable: false,
            configurable: true
        })
    } else {
        host[name] = value
    }
}

function toJson(val) {
    var xtype = avalon.type(val)
    if (xtype === "array") {
        if (val.$events) {
            var array = []
            for (var i = 0; i < val.length; i++) {
                array[i] = toJson(val[i])
            }
            return array
        }
    } else if (xtype === "object" && val.$events) {
        var obj = {}
        for (i in val) {
            if (val.hasOwnProperty(i)) {
                obj[i] = toJson(val[i])
            }
        }
        return obj
    }
    return val
}

var $modelDescriptor = {
    get: function () {
        return toJson(this)
    },
    set: noop,
    enumerable: false,
    configurable: true
}

var $watch = function (expr, callback, option) {
    var watcher = {
        handler: callback,
        type: "userWatcher",
        element: root
    }
    parseExpr(expr, [this], watcher)
    avalon.injectBinding(watcher)
    return function () {
        watcher.element = null
    }
}
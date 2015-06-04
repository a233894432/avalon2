var rhasHtml = /\|\s*html\s*/,
        r11a = /\|\|/g,
        rlt = /&lt;/g,
        rgt = /&gt;/g,
        rstringLiteral = /(['"])(\\\1|.)+?\1/g
function getToken(value, pos) {
    if (value.indexOf("|") > 0) {
        var scapegoat = value.replace(rstringLiteral, function (_) {
            return Array(_.length + 1).join("1")// jshint ignore:line
        })
        var index = scapegoat.replace(r11a, "\u1122\u3344").indexOf("|") //干掉所有短路或
        if (index > -1) {
            var type = "text"
            var filters = value.slice(index).replace(rhasHtml, function () {
                type = "html"
                return ""
            })
            return {
                type: type,
                filters: filters,
                value: value.slice(0, index),
                pos: pos || 0,//???
                expr: true
            }
        }
    }
    return {
        value: value,
        filters: "",
        expr: true
    }
}

function scanExpr(str) {
    var tokens = [],
            value, start = 0,
            stop
    do {
        stop = str.indexOf(openTag, start)
        if (stop === -1) {
            break
        }
        value = str.slice(start, stop)
        if (value) { // {{ 左边的文本
            tokens.push({
                value: value,
                filters: "",
                expr: false
            })
        }
        start = stop + openTag.length
        stop = str.indexOf(closeTag, start)
        if (stop === -1) {
            break
        }
        value = str.slice(start, stop)
        if (value) { //处理{{ }}插值表达式
            tokens.push(getToken(value, start))
        }
        start = stop + closeTag.length
    } while (1)
    value = str.slice(start)
    if (value) { //}} 右边的文本
        tokens.push({
            value: value,
            expr: false,
            filters: ""
        })
    }
    return tokens
}

function scanText(textNode, vmodels) {
    var bindings = []
    if (textNode.nodeType === 8) {
        var token = getToken(textNode.nodeValue)
        var tokens = [token]
    } else {
        tokens = scanExpr(textNode.nodeValue)
    }
    var parent = textNode.parentNode
    if (tokens.length) {
        var fragment = parent.isVirtual ? new VDocumentFragment() : DOC.createDocumentFragment()
        for (var i = 0; token = tokens[i++]; ) {
            var node = parent.isVirtual ? new VText(token.value) : DOC.createTextNode(token.value) //将文本转换为文本节点，并替换原来的文本节点
            if (token.expr) {
              //  token.type = "text"
                token.element = node
//                token.filters = token.filters.replace(rhasHtml, function () {
//                    token.type = "html"
//                    return ""
//                })// jshint ignore:line
                bindings.push(token) //收集带有插值表达式的文本
            }
            fragment.appendChild(node)
        }
        parent.replaceChild(fragment, textNode)
        if (bindings.length) {
            executeBindings(bindings, vmodels)
        }
    }
}

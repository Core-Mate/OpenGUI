package com.coremate.opengui.automation.base.utils

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Node utilities
 * */
object AMNodeUtils {

    /**
 * Get the first Node Info by ID
     */
    fun getFirstNodeById(
        nodeInfo: AccessibilityNodeInfo?,
        ids: MutableList<String>
    ): AccessibilityNodeInfo? {
        for (id in ids) {
            val itemInfo = nodeInfo?.findAccessibilityNodeInfosByViewId(id)
            if (itemInfo != null && itemInfo.size > 0) {
                return itemInfo[0]
            }
        }
        return null
    }

    /**
 * Get the first Node Info by ID with predicate
     */
    fun getFirstNodeByIdWithCallback(
        parentOrRoot: AccessibilityNodeInfo?,
        callback: MatchCallback<AccessibilityNodeInfo>,
        ids: MutableList<String>
    ): AccessibilityNodeInfo? {
        for (id in ids) {
            findNodeById(
                parentOrRoot,
                id,
                0,
                callback
            )?.takeIf {
                return it
            }
        }
        return null
    }

    fun findNodeById(
        parentOrRoot: AccessibilityNodeInfo?,
        id: String,
        index: Int,
        callback: MatchCallback<AccessibilityNodeInfo>
    ): AccessibilityNodeInfo? {
        val list = findNodesById(
            parentOrRoot,
            id, callback
        )
        return if (list.isEmpty()) null else if (list.size <= index) null else list[index]
    }

    /**
 * Get node by ID
     * */
    private fun findNodesById(
        parentOrRoot: AccessibilityNodeInfo?,
        id: String,
        callback: MatchCallback<AccessibilityNodeInfo>
    ): List<AccessibilityNodeInfo> {
        val resultList = mutableListOf<AccessibilityNodeInfo>()
        parentOrRoot?.findAccessibilityNodeInfosByViewId(id)?.let {
            if (it.isEmpty()) return resultList
            for (resultNode in it) {
                if (callback.isMatch(resultNode)) {
                    resultList.add(resultNode)
                }
            }
        }
        return resultList
    }

    /**
 * Get all Node Info by ID exactly
     */
    fun getAllNodeById(
        nodeInfo: AccessibilityNodeInfo?,
        ids: MutableList<String>
    ): MutableList<AccessibilityNodeInfo?> {
        val accessibilityNodeInfo = mutableListOf<AccessibilityNodeInfo?>()
        if (nodeInfo == null) return accessibilityNodeInfo
        for (id in ids) {
            accessibilityNodeInfo.addAll(nodeInfo.findAccessibilityNodeInfosByViewId(id))
        }
        return accessibilityNodeInfo
    }

    /**
 * Get the first Node Info by text
     */
    fun getFirstNodeByText(
        nodeInfo: AccessibilityNodeInfo?,
        isContain: Boolean = false,
        vararg texts: String,
    ): AccessibilityNodeInfo? {
        if (nodeInfo == null) return null
        for (str in texts) {
            val itemInfo = nodeInfo.findAccessibilityNodeInfosByText(str)
            if (itemInfo != null && itemInfo.size > 0) {
                for (tvInfo in itemInfo) {
                    if (isContain) {
                        if (tvInfo.text != null && str.contains(tvInfo.text.toString())) {
                            return tvInfo
                        }
                    } else {
                        if (tvInfo.text != null && str == tvInfo.text.toString()) {
                            return tvInfo
                        }
                    }
                }
            }
        }
        return null
    }

    /**
 * Get the first Node Info by desc
     */
    fun getFirstNodeByDesc(
        nodeInfo: AccessibilityNodeInfo?,
        isContain: Boolean = false,
        vararg texts: String,
    ): AccessibilityNodeInfo? {
        if (nodeInfo == null) return null
        for (str in texts) {
            val itemInfo = nodeInfo.findAccessibilityNodeInfosByText(str)
            if (itemInfo != null && itemInfo.size > 0) {
                for (tvInfo in itemInfo) {
                    if (isContain) {
                        if (tvInfo.contentDescription != null && str.contains(tvInfo.contentDescription.toString())) {
                            return tvInfo
                        }
                    } else {
                        if (tvInfo.contentDescription != null && str == tvInfo.contentDescription.toString()) {
                            return tvInfo
                        }
                    }

                }
            }
        }
        return null
    }

    /**
 * Get the first Node Info by desc
     */
    fun getFirstNodeByDescCallBack(
        nodeInfo: AccessibilityNodeInfo?,
        callback: MatchCallback<AccessibilityNodeInfo>,
        vararg texts: String
    ): AccessibilityNodeInfo? {
        if (nodeInfo == null) return null
        for (str in texts) {
            val itemInfo = nodeInfo.findAccessibilityNodeInfosByText(str)
            if (itemInfo != null && itemInfo.size > 0) {
                for (tvInfo in itemInfo) {
                    if (tvInfo.contentDescription != null && str == tvInfo.contentDescription.toString() && callback.isMatch(
                            tvInfo
                        )
                    ) {
                        return tvInfo
                    }
                }
            }
        }
        return null
    }

    /**
 * Get the first Node Info by fuzzy ID and text match
     */
    fun getFirstNodeByIdWithContainText(
        nodeInfo: AccessibilityNodeInfo?,
        ids: MutableList<String>,
        vararg texts: String
    ): AccessibilityNodeInfo? {
        if (nodeInfo == null) return null
        for (id in ids) {
            val itemInfo = nodeInfo.findAccessibilityNodeInfosByViewId(id)
            if (itemInfo != null && itemInfo.size > 0) {
                for (idNodeInfo in itemInfo) {
                    for (str in texts) {
                        if (idNodeInfo.text != null && idNodeInfo.text.contains(str)) {
                            return itemInfo[0]
                        }
                    }
                }
            }
        }
        return null
    }

    /**
 * Get node by class Name
     */
    fun getNodeByClassName(
        nodeInfo: AccessibilityNodeInfo?,
        vararg classNames: String,
        b: Boolean = false
    ): AccessibilityNodeInfo? {
        if (nodeInfo == null) return null
        return findNode(
            nodeInfo,
            b,
            true,
            matchCallback = object : MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    for (className in classNames) {
                        if (result?.className != null && result.className.toString() == className) {
                            return true
                        }
                    }
                    return false
                }
            })
    }

    /**
 * Get the first sibling layout by Class Name
     */
    fun getBrotherNodeByClassName(
        nodeInfo: AccessibilityNodeInfo?,
        className: String,
        sort: Boolean = false
    ): AccessibilityNodeInfo? {
        if (sort) {
            if (nodeInfo != null && nodeInfo.parent != null) {
                for (i in nodeInfo.parent.childCount - 1 downTo 0) {
                    val childNodeInfo = nodeInfo.parent.getChild(i)
                    if (childNodeInfo != null && childNodeInfo.className != null && childNodeInfo.className.toString() == className) {
                        return childNodeInfo
                    }
                }
            }
        } else {
            if (nodeInfo != null && nodeInfo.parent != null) {
                for (i in 0 until nodeInfo.parent.childCount) {
                    val childNodeInfo = nodeInfo.parent.getChild(i)
                    if (childNodeInfo != null && childNodeInfo.className != null && childNodeInfo.className.toString() == className) {
                        return childNodeInfo
                    }
                }
            }

        }
        return null
    }

    /**
 * Get all Node Info by Class Name exactly
     */
    fun getAllNodeByClassName(
        nodeInfo: AccessibilityNodeInfo?,
        className: String,
    ): List<AccessibilityNodeInfo> {
        val list = mutableListOf<AccessibilityNodeInfo>()
        if (nodeInfo == null) return list
        for (i in 0 until (nodeInfo.childCount)) {
            val childNodeInfo = nodeInfo.getChild(i)
            if (childNodeInfo?.className != null) {
                if (childNodeInfo.className.toString() == className) {
                    list.add(childNodeInfo)
                }
            }
            val vNodeInfo = getAllNodeByClassName(childNodeInfo, className)
            if (vNodeInfo.isNotEmpty()) {
                list.addAll(vNodeInfo)
            }
        }
        return list
    }

    /**
 * Get the first Node Info by desc and class Name
     */
    fun getFirstNodeByDescWithClassName(
        nodeInfo: AccessibilityNodeInfo?,
        className: String,
        vararg texts: String
    ): AccessibilityNodeInfo? {
        if (nodeInfo == null) return null
        for (str in texts) {
            val itemInfo = nodeInfo.findAccessibilityNodeInfosByText(str)
            if (itemInfo != null && itemInfo.size > 0) {
                for (tvInfo in itemInfo) {
                    if (tvInfo.contentDescription != null && tvInfo.className != null && str == tvInfo.contentDescription.toString() && tvInfo.className.toString() == className) {
                        return tvInfo
                    }
                }
            }
        }
        return null
    }

    /**
 * Get the first Node Info by desc and class Name
     */
    fun getAllNodeContainDesc(
        nodeInfo: AccessibilityNodeInfo?,
        vararg texts: String
    ): MutableList<AccessibilityNodeInfo> {
        val list = mutableListOf<AccessibilityNodeInfo>()
        if (nodeInfo == null) return list
        for (str in texts) {
            val itemInfo = nodeInfo.findAccessibilityNodeInfosByText(str)
            if (itemInfo != null && itemInfo.size > 0) {
                for (tvInfo in itemInfo) {
                    if (tvInfo.contentDescription != null && tvInfo.contentDescription.toString()
                            .contains(str)
                    ) {
                        list.add(tvInfo)
                    }
                }
            }
        }
        return list
    }


    /**
 * Get node
     * */
    private fun findNode(
        accessibilityNodeInfo: AccessibilityNodeInfo?,
        b: Boolean,
        b2: Boolean = true,
        n: Int = 0,
        matchCallback: MatchCallback<AccessibilityNodeInfo>
    ): AccessibilityNodeInfo? {
        var nodeInfo = accessibilityNodeInfo
        val arrayDeque = ArrayDeque<AccessibilityNodeInfo?>()
        arrayDeque.add(accessibilityNodeInfo)
        var n2 = 0
        while (!arrayDeque.isEmpty()) {
            nodeInfo = arrayDeque.removeFirst()
            var n3 = n2
            if (matchCallback.isMatch(nodeInfo)) {
                if (n2 == n) {
                    return nodeInfo
                }
                n3 = n2 + 1
            }
            val childCount = nodeInfo?.childCount ?: 0
            val list = ArrayList<Any>(childCount)
            for (i in 0 until childCount) {
                val itemNodeInfo = nodeInfo?.getChild(i)
                if (itemNodeInfo != null) {
                    list.add(itemNodeInfo)
                }
            }
            if (!b2) {
                list.reverse()
            }
            if (b) {
                val iterator = list.iterator() as Iterator<AccessibilityNodeInfo>
                while (true) {
                    n2 = n3
                    if (!iterator.hasNext()) {
                        break
                    }
                    nodeInfo = iterator.next()
                    arrayDeque.addLast(nodeInfo)
                }
            } else {
                list.reverse()
                val iterator2 = list.iterator() as Iterator<AccessibilityNodeInfo>
                while (true) {
                    n2 = n3
                    if (!iterator2.hasNext()) {
                        break
                    }
                    nodeInfo = iterator2.next()
                    arrayDeque.addFirst(nodeInfo)
                }
            }
        }
        nodeInfo = null
        return nodeInfo
    }

    fun getAllChildNodeByClassNameWithCallback(
        paramAccessibilityNodeInfo: AccessibilityNodeInfo,
        paramString: String
    ): MutableList<AccessibilityNodeInfo> {
        return findChildNodes(paramAccessibilityNodeInfo, matchAction = {
            it.className == paramString
        })
    }

    /**
 * Get child nodes
     * */
    fun findChildNodes(
        rootNode: AccessibilityNodeInfo?,
        matchAction: (AccessibilityNodeInfo) -> Boolean
    ): MutableList<AccessibilityNodeInfo> {
        if (rootNode == null) return mutableListOf()
        var nodeInfo: AccessibilityNodeInfo = rootNode
        val arrayList = mutableListOf<AccessibilityNodeInfo>()
        val arrayDeque = ArrayDeque<AccessibilityNodeInfo>()
        arrayDeque.add(nodeInfo)
        for (i in 0 until nodeInfo.childCount) {
            val accessibilityNodeInfo = nodeInfo.getChild(i)
            if (accessibilityNodeInfo != null) arrayDeque.addLast(accessibilityNodeInfo)
        }
        while (!arrayDeque.isEmpty()) {
            nodeInfo = arrayDeque.removeFirst()
            if (matchAction(nodeInfo)) {
                arrayList.add(nodeInfo)
            }
        }
        return arrayList
    }

}

interface MatchCallback<T> {
    fun isMatch(result: T?): Boolean
}
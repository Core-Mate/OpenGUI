package com.coremate.opengui.automation.biz.common.float

import com.coremate.opengui.automation.base.component.AMCompRepository
import com.coremate.opengui.automation.base.utils.AMScreenUtils

class EnterRepository : AMCompRepository() {
    //Initial coordinates
    override var startX = AMScreenUtils.screenWidth() / 2 - AMScreenUtils.dp2px(10f)
    override var startY =
        AMScreenUtils.screenHeight() - AMScreenUtils.dp2px(160f + 49f) - AMScreenUtils.getStatusBarHeight()

}
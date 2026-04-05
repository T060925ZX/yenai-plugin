import { Config, Log_Prefix } from "../../components/index.js"
import { common, GroupAdmin as Ga } from "../../model/index.js"
import _ from "lodash"
import { sleep } from "../../tools/index.js"
import nodemailer from "nodemailer"

// 全局
let temp = {}
const ops = [ "+", "-" ]

// 邮件传输器缓存
let transporter = null
export class GroupVerify extends plugin {
  constructor() {
    super({
      name: "椰奶群管-入群验证",
      event: "message.group",
      priority: 5,
      rule: [
        {
          reg: "^#重新验证(\\d+)?$",
          fnc: "cmdReverify"
        },
        {
          reg: "^#重新验证从未发言的人$",
          fnc: "cmdReverifyNeverSpeak"
        },
        {
          reg: "^#绕过验证(\\d+)?$",
          fnc: "cmdPass"
        },
        {
          reg: "^#(开启|关闭)验证$",
          fnc: "handelverify"
        },
        {
          reg: "^#切换验证模式$",
          fnc: "setmode"
        },
        {
          reg: "^#设置验证超时时间(\\d+)(s|秒)?$",
          fnc: "setovertime"
        },
        {
          reg: "^#切换验证类型$",
          fnc: "setVerifyType"
        }
      ]
    })
    this.verifycfg = Config.groupAdmin.groupVerify
  }

  // 重新验证
  async cmdReverify(e) {
    if (!common.checkPermission(e, "admin", "admin")) return

    if (!this.verifycfg.openGroup.includes(e.group_id)) return e.reply("当前群未开启验证哦~", true)

    let qq = e.message.find(item => item.type == "at")?.qq
    if (!qq) qq = e.msg.replace(/#|重新验证/g, "").trim()

    qq = Number(qq) || String(qq)
    if (qq == (e.bot ?? Bot).uin) return

    const member = await e.group.pickMember(qq)
    let info = member?.info || await member?.getInfo?.()

    if (!info) return e.reply("❎ 目标群成员不存在")
    if (info.role === "owner" || info.role === "admin") return e.reply("❎ 该命令对群主或管理员无效")

    if (Config.masterQQ.includes(qq)) return e.reply("❎ 该命令对机器人主人无效")

    if (temp[`${e.group_id}:${qq}`]) return e.reply("❎ 目标群成员处于验证状态")

    await verify(qq, e.group_id, e)
  }

  // 绕过验证
  async cmdPass(e) {
    if (!common.checkPermission(e, "admin", "admin")) return

    if (!this.verifycfg.openGroup.includes(e.group_id)) return e.reply("当前群未开启验证哦~", true)

    let qq = e.message.find(item => item.type == "at")?.qq
    if (!qq) qq = e.msg.replace(/#|绕过验证/g, "").trim()

    if (!(/\d{5,}/.test(qq))) return e.reply("❎ 请输入正确的QQ号")

    if (qq == (e.bot ?? Bot).uin) return
    qq = Number(qq) || String(qq)
    if (!temp[`${e.group_id}:${qq}`]) return e.reply("❎ 目标群成员当前无需验证")

    clearTimeout(temp[`${e.group_id}:${qq}`].kickTimer)

    clearTimeout(temp[`${e.group_id}:${qq}`].remindTimer)

    delete temp[`${e.group_id}:${qq}`]

    return await e.reply(this.verifycfg.SuccessMsgs[e.group_id] || this.verifycfg.SuccessMsgs[0] || "✅ 验证成功，欢迎入群")
  }

  async cmdReverifyNeverSpeak(e) {
    let list = null
    try {
      list = await new Ga(e).getNeverSpeak(e.group_id)
    } catch (error) {
      return common.handleException(e, error)
    }
    for (let item of list) {
      await verify(item.user_id, e.group_id, e)
      await sleep(2000)
    }
  }

  // 开启验证
  async handelverify(e) {
    if (!common.checkPermission(e, "admin", "admin")) return
    let type = /开启/.test(e.msg) ? "add" : "del"
    let isopen = this.verifycfg.openGroup.includes(e.group_id)
    if (isopen && type == "add") return e.reply("❎ 本群验证已处于开启状态")
    if (!isopen && type == "del") return e.reply("❎ 本群暂未开启验证")
    Config.modifyArr("groupAdmin", "groupVerify.openGroup", e.group_id, type)
    e.reply(`✅ 已${type == "add" ? "开启" : "关闭"}本群验证`)
  }

  // 切换验证模式（数学计算的精确/模糊）
  async setmode(e) {
    if (!common.checkPermission(e, "master")) return
    let value = this.verifycfg.mode == "模糊" ? "精确" : "模糊"
    Config.modify("groupAdmin", "groupVerify.mode", value)
    e.reply(`✅ 已切换验证模式为${value}验证`)
  }

  // 切换验证类型（数学计算/邮箱验证码）
  async setVerifyType(e) {
    if (!common.checkPermission(e, "master")) return
    let currentType = this.verifycfg.verifyType || "math"
    let newType = currentType === "math" ? "email" : "math"
    Config.modify("groupAdmin", "groupVerify.verifyType", newType)
    e.reply(`✅ 已切换验证类型为${newType === "math" ? "数学计算" : "邮箱验证码"}验证`)
  }

  // 设置验证超时时间
  async setovertime(e) {
    if (!common.checkPermission(e, "master")) return
    let overtime = e.msg.match(/\d+/g)
    Config.modify("groupAdmin", "groupVerify.time", Number(overtime))
    e.reply(`✅ 已将验证超时时间设置为${overtime}秒`)
    if (overtime < 60) {
      e.reply("建议至少一分钟(60秒)哦ε(*´･ω･)з")
    }
  }
}

// 进群监听
Bot.on?.("notice.group.increase", async(e) => {
  let { openGroup, DelayTime } = Config.groupAdmin.groupVerify
  if (!openGroup.includes(e.group_id)) return
  logger.mark(`${Log_Prefix}[进群验证]收到${e.user_id}的进群事件`)
  if (!e.group.is_admin && !e.group.is_owner) return
  if (e.user_id == (e.bot ?? Bot).uin) return
  if (Config.masterQQ.includes(e.user_id)) return
  if (Config.groupAdmin.whiteQQ.includes(e.user_id)) return

  await sleep(DelayTime * 1000)
  await verify(e.user_id, e.group_id, e)
})

// 答案监听
Bot.on?.("message.group", async(e) => {
  let { openGroup, mode, SuccessMsgs, verifyType } = Config.groupAdmin.groupVerify

  if (!openGroup.includes(e.group_id)) return

  if (!e.group.is_admin && !e.group.is_owner) return

  if (!temp[`${e.group_id}:${e.user_id}`]) return

  const verifyData = temp[`${e.group_id}:${e.user_id}`]
  
  // 根据验证类型处理
  if (verifyType === "email") {
    return await handleEmailVerify(e, verifyData)
  } else {
    return await handleMathVerify(e, verifyData)
  }
})

// 处理数学计算验证
async function handleMathVerify(e, verifyData) {
  const { mode, SuccessMsgs } = Config.groupAdmin.groupVerify
  const { verifyCode, kickTimer, remindTimer, nums, operator } = verifyData

  const isAccurateModeOK = mode === "精确" && e.raw_message == verifyCode

  const isVagueModeOK = mode === "模糊" && e.raw_message?.includes(verifyCode)

  const isOK = isAccurateModeOK || isVagueModeOK

  if (isOK) {
    delete temp[`${e.group_id}:${e.user_id}`]
    clearTimeout(kickTimer)
    clearTimeout(remindTimer)
    return await sendMsg(e, SuccessMsgs[e.group_id] || SuccessMsgs[0] || "✅ 验证成功，欢迎入群")
  } else {
    verifyData.remainTimes -= 1

    const { remainTimes } = verifyData

    if (remainTimes > 0) {
      await e.group.recallMsg(e.message_id)

      const msg = `\n❎ 验证失败\n你还有「${remainTimes}」次机会\n请发送「${nums[0]} ${operator} ${nums[1]}」的运算结果`
      return await sendMsg(e, [ segment.at(e.user_id), msg ])
    }
    clearTimeout(kickTimer)
    clearTimeout(remindTimer)
    await sendMsg(e, [ segment.at(e.user_id), "\n验证失败，请重新申请" ])
    delete temp[`${e.group_id}:${e.user_id}`]
    return await e.group.kickMember(e.user_id)
  }
}

// 处理邮箱验证码验证
async function handleEmailVerify(e, verifyData) {
  const { SuccessMsgs, emailVerify } = Config.groupAdmin.groupVerify
  const { verifyCode, kickTimer, remindTimer } = verifyData

  const userInput = e.raw_message?.trim()
  
  // 检查是否是邮箱验证码（纯数字）
  if (userInput && /^\d+$/.test(userInput) && userInput.length === emailVerify.codeLength) {
    const isOK = userInput === verifyCode
    
    if (isOK) {
      delete temp[`${e.group_id}:${e.user_id}`]
      clearTimeout(kickTimer)
      clearTimeout(remindTimer)
      return await sendMsg(e, SuccessMsgs[e.group_id] || SuccessMsgs[0] || "✅ 验证成功，欢迎入群")
    } else {
      verifyData.attempts += 1
      
      if (verifyData.attempts >= emailVerify.maxAttempts) {
        clearTimeout(kickTimer)
        clearTimeout(remindTimer)
        await sendMsg(e, [ segment.at(e.user_id), "\n验证码错误次数过多，请重新申请" ])
        delete temp[`${e.group_id}:${e.user_id}`]
        return await e.group.kickMember(e.user_id)
      } else {
        const remainingAttempts = emailVerify.maxAttempts - verifyData.attempts
        await e.group.recallMsg(e.message_id)
        const msg = `\n❎ 验证码错误\n你还有「${remainingAttempts}」次机会\n请重新输入验证码`
        return await sendMsg(e, [ segment.at(e.user_id), msg ])
      }
    }
  } else if (userInput) {
    // 如果发送的不是验证码格式的消息，撤回并警告
    await e.group.recallMsg(e.message_id)
    const msg = `\n⚠️ 请注意！\n当前正在进行邮箱验证\n请发送收到的6位数字验证码\n不要发送其他内容\n验证码可以在QQ搜索QQ邮箱中查看`
    return await sendMsg(e, [ segment.at(e.user_id), msg ])
  }
}

// 主动退群
Bot.on?.("notice.group.decrease", async(e) => {
  if (!e.group.is_admin && !e.group.is_owner) return

  if (!temp[`${e.group_id}:${e.user_id}`]) return

  clearTimeout(temp[`${e.group_id}:${e.user_id}`].kickTimer)

  clearTimeout(temp[`${e.group_id}:${e.user_id}`].remindTimer)

  delete temp[`${e.group_id}:${e.user_id}`]

  sendMsg(e, `「${e.user_id}」主动退群，验证流程结束`)
})

/**
 * 进行验证
 * @param userId 用户QQ号
 * @param groupId 群号
 * @param e 消息事件
 */
async function verify(userId, groupId, e) {
  if (!e.group.is_admin && !e.group.is_owner) return
  userId = Number(userId)
  groupId = Number(groupId)
  logger.mark(`${Log_Prefix}[进群验证]进行${userId}的验证`)

  const { verifyType } = Config.groupAdmin.groupVerify
  
  // 根据验证类型选择不同的验证方式
  if (verifyType === "email") {
    await verifyByEmail(userId, groupId, e)
  } else {
    await verifyByMath(userId, groupId, e)
  }
}

/**
 * 数学计算验证
 */
async function verifyByMath(userId, groupId, e) {
  const { times, range, time, remindAtLastMinute } = Config.groupAdmin.groupVerify
  const operator = ops[_.random(0, 1)]

  let [ m, n ] = [ _.random(range.min, range.max), _.random(range.min, range.max) ]
  while (m == n) {
    n = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min
  }

  [ m, n ] = [ m >= n ? m : n, m >= n ? n : m ]

  const verifyCode = String(operator === "-" ? m - n : m + n)
  logger.mark(`${Log_Prefix}[进群验证]答案：${verifyCode}`)
  const kickTimer = setTimeout(async() => {
    sendMsg(e, [ segment.at(userId), "\n验证超时，移出群聊，请重新申请" ])

    delete temp[`${groupId}:${userId}`]

    clearTimeout(kickTimer)

    return await e.group.kickMember(userId)
  }, time * 1000)

  const shouldRemind = remindAtLastMinute && time >= 120

  const remindTimer = setTimeout(async() => {
    if (shouldRemind && temp[`${groupId}:${userId}`].remindTimer) {
      const msg = ` \n验证仅剩最后一分钟\n请发送「${m} ${operator} ${n}」的运算结果\n否则将会被移出群聊`

      await sendMsg(e, [ segment.at(userId), msg ])
    }
    clearTimeout(remindTimer)
  }, Math.abs(time * 1000 - 60000))

  const msg = ` 欢迎！\n请在「${time}」秒内发送\n「${m} ${operator} ${n}」的运算结果\n否则将会被移出群聊`

  // 消息发送成功才写入
  if (await sendMsg(e, [ segment.at(userId), msg ])) {
    temp[`${groupId}:${userId}`] = {
      remainTimes: times,
      nums: [ m, n ],
      operator,
      verifyCode,
      kickTimer,
      remindTimer
    }
  } else {
    // 删除定时器
    clearTimeout(remindTimer)
    clearTimeout(kickTimer)
  }
}

/**
 * 邮箱验证码验证
 */
async function verifyByEmail(userId, groupId, e) {
  const { time, smtpConfig, emailVerify } = Config.groupAdmin.groupVerify
  
  // 直接使用QQ号拼接邮箱
  const userEmail = `${userId}@qq.com`
  
  // 生成验证码
  const verifyCode = generateVerificationCode(emailVerify.codeLength)
  logger.mark(`${Log_Prefix}[邮箱验证]用户${userId}的验证码：${verifyCode}`)
  
  // 发送邮件
  try {
    await sendVerificationEmail(userEmail, verifyCode, userId, groupId)
  } catch (error) {
    logger.error(`${Log_Prefix}[邮箱验证]发送邮件失败: ${error.message}`)
    const msg = ` 欢迎！\n验证码发送失败，请联系管理员\n错误信息：${error.message}`
    await sendMsg(e, [ segment.at(userId), msg ])
    return
  }
  
  // 设置超时踢出
  const kickTimer = setTimeout(async() => {
    sendMsg(e, [ segment.at(userId), "\n验证超时，移出群聊，请重新申请" ])
    delete temp[`${groupId}:${userId}`]
    clearTimeout(kickTimer)
    return await e.group.kickMember(userId)
  }, time * 1000)
  
  const msg = ` 欢迎！\n验证码已发送至：${userEmail}\n请在「${time}」秒内输入验证码\n否则将会被移出群聊`
  
  // 消息发送成功才写入
  if (await sendMsg(e, [ segment.at(userId), msg ])) {
    temp[`${groupId}:${userId}`] = {
      verifyCode,
      kickTimer,
      remindTimer: null,
      attempts: 0,
      type: "email"
    }
  } else {
    // 删除定时器
    clearTimeout(kickTimer)
  }
}

/**
 * 生成验证码
 */
function generateVerificationCode(length) {
  const chars = '0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * 发送验证邮件
 */
async function sendVerificationEmail(toEmail, code, userId, groupId) {
  // 创建或复用transporter
  if (!transporter) {
    const { smtpConfig } = Config.groupAdmin.groupVerify
    
    transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      }
    })
  }
  
  const { smtpConfig } = Config.groupAdmin.groupVerify
  
  const mailOptions = {
    from: `"${smtpConfig.fromName}" <${smtpConfig.user}>`,
    to: toEmail,
    subject: "入群验证码",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">入群验证</h2>
        <p>您好！</p>
        <p>您正在尝试加入QQ群：<strong>${groupId}</strong></p>
        <p>您的验证码是：</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; color: #007bff; letter-spacing: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p>验证码有效期为5分钟，请尽快在群内输入此验证码完成验证。</p>
        <p style="color: #999; font-size: 12px;">如果这不是您的操作，请忽略此邮件。</p>
      </div>
    `
  }
  
  await transporter.sendMail(mailOptions)
}
async function sendMsg(e, msg) {
  const sendMsgFunctions = {
    reply: async() => e.reply(msg),
    group: async() => e.group.sendMsg(msg),
    bot: async() => e.bot.pinkGroup(e.group_id).sendMsg(msg),
    self_id: async() => Bot[e.self_id].pinkGroup(e.group_id).sendMsg(msg)
  }

  for (const key in sendMsgFunctions) {
    if (e[key]) {
      try {
        const sendFunction = sendMsgFunctions[key]
        let res = await sendFunction()
        return res
      } catch (error) {
        logger.debug(`${Log_Prefix}[进群验证]发送消息失败: ${error.message}`)
      }
    }
  }

  throw Error(`${Log_Prefix}[进群验证]未获取到发送消息函数`)
}

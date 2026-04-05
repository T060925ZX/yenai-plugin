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
 * 渲染邮件模板
 */
function renderEmailTemplate(template, variables) {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{${key}}`, 'g')
    rendered = rendered.replace(regex, value)
  }
  return rendered
}

/**
 * 获取内置邮件模板
 */
function getBuiltInTemplate(style) {
  const templates = {
    // 渐变紫色（默认）
    'gradient-purple': `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Microsoft YaHei', Arial, sans-serif; background-color: #f5f7fa;">
        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">入群验证</h1>
          </div>
          <div style="padding: 40px 30px;">
            <p style="color: #333; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">您好！</p>
            <p style="color: #666; font-size: 15px; line-height: 1.8; margin: 0 0 25px 0;">
              您正在尝试加入 QQ 群：<strong style="color: #667eea;">{groupId}</strong>
            </p>
            <p style="color: #666; font-size: 15px; line-height: 1.8; margin: 0 0 15px 0;">
              您的验证码是：
            </p>
            <div style="background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%); padding: 25px; text-align: center; border-radius: 8px; margin: 25px 0; border: 2px dashed #667eea;">
              <span style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">{code}</span>
            </div>
            <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 20px 0;">
              ⏱️ 验证码有效期：<strong style="color: #667eea;">{expireTime} 秒</strong><br>
              💡 请在群内输入此验证码完成验证
            </p>
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0; border-radius: 4px;">
              <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
                ⚠️ 温馨提示：如果这不是您的操作，请忽略此邮件。请勿将验证码泄露给他人。
              </p>
            </div>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.6;">
              此邮件由系统自动发送，请勿回复<br>
              © 2026 椰奶机器人
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    
    // 简约蓝色
    'simple-blue': `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1976d2; margin: 0 0 20px 0;">🔐 入群验证</h2>
          <p style="color: #666; font-size: 15px; line-height: 1.6;">您好！您正在尝试加入群聊 <strong>{groupId}</strong></p>
          <div style="background: #e3f2fd; padding: 25px; text-align: center; margin: 25px 0; border-radius: 6px; border-left: 4px solid #1976d2;">
            <p style="color: #999; margin: 0 0 10px 0; font-size: 14px;">验证码</p>
            <span style="font-size: 32px; font-weight: bold; color: #1976d2; letter-spacing: 6px; font-family: 'Courier New', monospace;">{code}</span>
          </div>
          <p style="color: #999; font-size: 14px; line-height: 1.6;">⏱️ 请在 <strong style="color: #1976d2;">{expireTime} 秒</strong> 内输入验证码完成验证</p>
          <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <p style="color: #bbb; font-size: 12px; margin: 0;">此邮件由系统自动发送，请勿回复</p>
          </div>
        </div>
      </body>
      </html>
    `,
    
    // 商务卡片
    'business-card': `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="margin: 0; padding: 40px; font-family: 'Microsoft YaHei', sans-serif; background-color: #f0f2f5;">
        <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); overflow: hidden;">
          <div style="background: #1890ff; padding: 25px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 24px;">欢迎加入</h2>
          </div>
          <div style="padding: 30px;">
            <p style="color: #333; font-size: 16px; margin: 0 0 15px 0;">您正在申请加入群聊</p>
            <p style="color: #1890ff; font-size: 20px; font-weight: bold; margin: 0 0 25px 0;">{groupId}</p>
            <div style="background: #f6ffed; border: 2px dashed #52c41a; padding: 25px; text-align: center; margin: 25px 0; border-radius: 8px;">
              <p style="color: #999; margin: 0 0 10px 0; font-size: 14px;">验证码</p>
              <span style="font-size: 36px; font-weight: bold; color: #52c41a; letter-spacing: 8px; font-family: 'Courier New', monospace;">{code}</span>
            </div>
            <p style="color: #666; font-size: 14px; text-align: center; margin: 20px 0;">
              请在 <strong style="color: #1890ff;">{expireTime}秒</strong> 内完成验证
            </p>
          </div>
          <div style="background: #fafafa; padding: 15px; text-align: center; border-top: 1px solid #e8e8e8;">
            <p style="color: #999; font-size: 12px; margin: 0;">© 2026 椰奶机器人 | 自动发送</p>
          </div>
        </div>
      </body>
      </html>
    `,
    
    // 暗色科技
    'dark-tech': `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="margin: 0; padding: 40px; font-family: 'Microsoft YaHei', sans-serif; background-color: #1a1a1a;">
        <div style="max-width: 550px; margin: 0 auto; background: #2d2d2d; border-radius: 10px; padding: 35px; box-shadow: 0 8px 16px rgba(0,0,0,0.3);">
          <h1 style="color: #00d4ff; text-align: center; margin: 0 0 25px 0; font-size: 26px;">🎯 入群验证</h1>
          <div style="background: #1a1a1a; padding: 25px; border-radius: 8px; margin: 20px 0; border: 1px solid #404040;">
            <p style="color: #b0b0b0; margin: 0 0 10px 0; font-size: 14px;">目标群聊</p>
            <p style="color: #00d4ff; margin: 0; font-size: 18px; font-weight: bold;">{groupId}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #b0b0b0; margin: 0 0 15px 0; font-size: 14px;">您的验证码</p>
            <div style="background: linear-gradient(135deg, #00d4ff 0%, #0099ff 100%); padding: 20px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(0,212,255,0.3);">
              <span style="font-size: 40px; font-weight: bold; color: white; letter-spacing: 10px; font-family: 'Courier New', monospace;">{code}</span>
            </div>
          </div>
          <div style="background: #3d3d3d; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <p style="color: #ffd700; margin: 0; font-size: 14px;">⏰ 有效期：{expireTime}秒</p>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin: 25px 0 0 0;">
            如果这不是您的操作，请忽略此邮件
          </p>
        </div>
      </body>
      </html>
    `,
    
    // 清新绿色
    'fresh-green': `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="margin: 0; padding: 40px; font-family: 'Microsoft YaHei', Arial, sans-serif; background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);">
        <div style="max-width: 580px; margin: 0 auto; background: white; border-radius: 15px; box-shadow: 0 6px 20px rgba(76,175,80,0.2); overflow: hidden;">
          <div style="background: linear-gradient(135deg, #66bb6a 0%, #43a047 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 26px;">✨ 入群验证</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #2e7d32; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">您好！欢迎加入我们的社区 🎉</p>
            <div style="background: #f1f8e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #66bb6a;">
              <p style="color: #558b2f; margin: 0 0 10px 0; font-size: 14px;">📍 群号</p>
              <p style="color: #2e7d32; margin: 0; font-size: 18px; font-weight: bold;">{groupId}</p>
            </div>
            <p style="color: #666; font-size: 15px; margin: 25px 0 15px 0;">🔑 您的验证码：</p>
            <div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 25px; text-align: center; border-radius: 10px; margin: 20px 0; border: 2px solid #66bb6a;">
              <span style="font-size: 38px; font-weight: bold; color: #2e7d32; letter-spacing: 8px; font-family: 'Courier New', monospace;">{code}</span>
            </div>
            <div style="background: #fff9c4; padding: 15px; border-radius: 6px; margin: 25px 0; text-align: center;">
              <p style="color: #f57f17; margin: 0; font-size: 14px;">⏱️ 有效期：<strong>{expireTime} 秒</strong> | 请尽快在群内输入</p>
            </div>
          </div>
          <div style="background: #f1f8e9; padding: 20px; text-align: center; border-top: 1px solid #c8e6c9;">
            <p style="color: #66bb6a; font-size: 12px; margin: 0;">🌿 椰奶机器人 | 自动发送</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
  
  return templates[style] || templates['gradient-purple']
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
  
  const { smtpConfig, emailVerify, time } = Config.groupAdmin.groupVerify
  
  // 准备模板变量
  const templateVariables = {
    code: code,
    groupId: groupId,
    groupName: '', // 可以后续扩展获取群名称
    userId: userId,
    expireTime: time
  }
  
  // 渲染邮件主题
  const subject = emailVerify.emailSubject || '入群验证码'
  const renderedSubject = renderEmailTemplate(subject, templateVariables)
  
  // 获取内置模板并渲染
  const templateStyle = emailVerify.emailTemplateStyle || 'gradient-purple'
  const htmlTemplate = getBuiltInTemplate(templateStyle)
  const renderedHtml = renderEmailTemplate(htmlTemplate, templateVariables)
  
  const mailOptions = {
    from: `"${smtpConfig.fromName}" <${smtpConfig.user}>`,
    to: toEmail,
    subject: renderedSubject,
    html: renderedHtml
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

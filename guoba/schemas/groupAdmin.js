export default [
  {
    component: "SOFT_GROUP_BEGIN",
    label: "群管配置"
  },
  {
    field: "groupAdmin.whiteQQ",
    label: "白名单QQ",
    component: "GTags",
    componentProps: {
      allowAdd: true,
      allowDel: true,
      valueFormatter: ((value) => Number.parseInt(value)).toString()
    }
  },
  {
    field: "groupAdmin.blackQQ",
    label: "黑名单QQ",
    component: "GTags",
    componentProps: {
      allowAdd: true,
      allowDel: true,
      valueFormatter: ((value) => Number.parseInt(value)).toString()
    }
  },
  {
    field: "groupAdmin.noBan",
    label: "白名单禁言自动解禁",
    component: "Switch"
  },
  {
    field: "groupAdmin.groupAddNotice.openGroup",
    label: "进群通知群聊",
    bottomHelpMessage: "将加群申请消息发送至群里面",
    component: "GSelectGroup"
  },
  {
    field: "groupAdmin.groupAddNotice.msg",
    label: "进群通知自定义消息",
    component: "Input"
  },
  {
    field: "groupAdmin.recallMsgPer.bot",
    label: "撤回bot消息权限",
    bottomHelpMessage: "#撤回命令",
    component: "RadioGroup",
    required: true,
    componentProps: {
      options: [
        { label: "所有人", value: "all" },
        { label: "管理", value: "admin" },
        { label: "群主", value: "owner" },
        { label: "主人", value: "master" }
      ]
    }
  },
  {
    field: "groupAdmin.recallMsgPer.member",
    label: "撤回群员消息权限",
    bottomHelpMessage: "#撤回命令",
    component: "RadioGroup",
    required: true,
    componentProps: {
      options: [
        { label: "所有人", value: "all" },
        { label: "管理", value: "admin" },
        { label: "群主", value: "owner" },
        { label: "主人", value: "master" }
      ]
    }
  },
  {
    component: "Divider",
    label: "群管投票禁言设置"
  },
  {
    field: "groupAdmin.VoteBan",
    label: "投票禁言",
    component: "Switch"
  },
  {
    field: "groupAdmin.VoteKick",
    label: "投票踢人",
    component: "Switch"
  },
  {
    field: "groupAdmin.outTime",
    label: "禁言超时时间",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.minNum",
    label: "最低所需票数",
    bottomHelpMessage: "不建议太低",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.BanTime",
    label: "成功禁言时间",
    bottomHelpMessage: "单位：秒",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.veto",
    label: "管理员一票否决",
    component: "Switch"
  },
  {
    field: "groupAdmin.voteAdmin",
    label: "投票禁言管理员",
    bottomHelpMessage: "开启后Bot为群主情况下可投票禁言管理员",
    component: "Switch"
  },
  {
    component: "Divider",
    label: "群管进群验证设置"
  },
  {
    field: "groupAdmin.groupVerify.openGroup",
    label: "开启的群聊",
    component: "GSelectGroup"
  },
  {
    field: "groupAdmin.groupVerify.SuccessMsgs",
    label: "验证成功消息",
    bottomHelpMessage: "0 字段代表默认回复",
    component: "GSubForm",
    componentProps: {
      multiple: true,
      schemas: [
        {
          field: "groupId",
          label: "群号",
          bottomHelpMessage: "",
          component: "Input",
          required: true
        },
        {
          field: "msg",
          label: "消息",
          bottomHelpMessage: "",
          component: "Input",
          required: true
        }
      ]
    }
  },
  {
    field: "groupAdmin.groupVerify.mode",
    label: "答案验证模式",
    component: "RadioGroup",
    required: true,
    componentProps: {
      options: [
        { label: "精确匹配", value: "精确" },
        { label: "模糊匹配", value: "模糊" }
      ]
    }
  },
  {
    field: "groupAdmin.groupVerify.times",
    label: "最多允许尝试次数",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.time",
    label: "超时时长",
    bottomHelpMessage: "单位：秒，建议至少一分钟（60 秒）。如果 >= 120 秒，将自动在最后一分钟提醒",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.range.min",
    label: "随机算式数字最小范围",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.range.max",
    label: "随机算式数字最大范围",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.DelayTime",
    label: "延迟发送验证时间",
    bottomHelpMessage: "收到进群事件后延迟多少秒再发送验证信息(秒) 确保验证消息在最下面",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.verifyType",
    label: "验证类型",
    bottomHelpMessage: "选择入群验证的方式",
    component: "RadioGroup",
    required: true,
    componentProps: {
      options: [
        { label: "数学计算", value: "math" },
        { label: "邮箱验证码", value: "email" }
      ]
    }
  },
  {
    component: "Divider",
    label: "SMTP邮件服务配置"
  },
  {
    field: "groupAdmin.groupVerify.smtpConfig.host",
    label: "SMTP服务器地址",
    bottomHelpMessage: "QQ邮箱: smtp.qq.com, 163邮箱: smtp.163.com, Gmail: smtp.gmail.com",
    component: "Input",
    required: true
  },
  {
    field: "groupAdmin.groupVerify.smtpConfig.port",
    label: "SMTP端口",
    bottomHelpMessage: "SSL端口通常为465或587",
    component: "InputNumber",
    required: true
  },
  {
    field: "groupAdmin.groupVerify.smtpConfig.secure",
    label: "使用SSL连接",
    component: "Switch"
  },
  {
    field: "groupAdmin.groupVerify.smtpConfig.user",
    label: "发件人邮箱地址",
    bottomHelpMessage: "用于发送验证码的邮箱",
    component: "Input",
    required: true
  },
  {
    field: "groupAdmin.groupVerify.smtpConfig.pass",
    label: "邮箱授权码",
    bottomHelpMessage: "不是登录密码，需要在邮箱设置中获取授权码",
    component: "InputPassword",
    required: true
  },
  {
    field: "groupAdmin.groupVerify.smtpConfig.fromName",
    label: "发件人显示名称",
    bottomHelpMessage: "收件人看到的发件人名称",
    component: "Input"
  },
  {
    component: "Divider",
    label: "邮箱验证码配置"
  },
  {
    field: "groupAdmin.groupVerify.emailVerify.codeLength",
    label: "验证码长度",
    bottomHelpMessage: "邮箱验证码的数字位数",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.emailVerify.maxAttempts",
    label: "最多允许尝试次数",
    bottomHelpMessage: "邮箱验证码错误次数上限",
    component: "InputNumber"
  },
  {
    field: "groupAdmin.groupVerify.emailVerify.emailSubject",
    label: "邮件主题",
    bottomHelpMessage: "支持变量：{groupId}, {groupName}",
    component: "Input"
  },
  {
    field: "groupAdmin.groupVerify.emailVerify.emailTemplateStyle",
    label: "邮件模板风格",
    bottomHelpMessage: "选择内置的邮件模板样式，选择custom可使用自定义模板",
    component: "RadioGroup",
    required: true,
    componentProps: {
      options: [
        { label: "渐变紫色（默认）", value: "gradient-purple" },
        { label: "简约蓝色", value: "simple-blue" },
        { label: "商务卡片", value: "business-card" },
        { label: "暗色科技", value: "dark-tech" },
        { label: "清新绿色", value: "fresh-green" },
        { label: "自定义模板", value: "custom" }
      ]
    }
  },
  {
    field: "groupAdmin.groupVerify.emailVerify.customTemplateFile",
    label: "自定义模板文件名",
    bottomHelpMessage: "当选择自定义模板时生效，文件放在config目录下。示例参考：email-template-example.html",
    component: "Input",
    componentProps: {
      placeholder: "my-email-template.html"
    }
  }
]

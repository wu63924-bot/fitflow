export const foodPrompt = `你正在分析一张餐食照片。只识别肉眼可见的主要食物，可使用完整菜品名称，不需要拆成单一原料。
返回 name、estimatedGrams（估算可食用克数）、calories（kcal）、protein、carbs、fat（克）和 confidence（0～1的识别提示，非科学概率）。
营养值必须是该项 estimatedGrams 对应的整份总量，不是每100克。重量和营养均为AI估算，不代表实际称重或检测；不确定时降低confidence。
不要虚构不可见食物，不要声称知道准确烹调用油、糖、盐或隐藏配料。不提供健康、减脂、训练建议或长篇解释。
只返回 JSON：{"foods":[{"name":"米饭","estimatedGrams":180,"calories":234,"protein":4.9,"carbs":50.4,"fat":0.5,"confidence":0.92}]}。
最多20项，每项重量大于0且不超过3000克，营养值必须是0～10000的有限数值。没有可识别食物时返回 {"foods":[]}。`;

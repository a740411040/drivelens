# DriveLens 诊断智能规格

本模块只做确定性计算。大模型可以解释结果，但不得生成或改写检出率、相似度、依赖字段及阈值敏感性。

## 1. 稳健性证书

`createRobustnessCertificate(incident)`默认执行100次带种子的Monte Carlo扰动：

- 随机丢弃5%的非首尾采样点；
- 时间戳加入最多±0.1秒抖动；
- 连续数值加入约±5%的有界噪声；
- 各检测阈值独立浮动±10%；
- 少量重规划计数加入±1扰动，再恢复为单调累计值。

每次扰动都重新计算事件是否检出和候选疑因排序，不复用展示层百分比。输出指标定义如下：

- `detectionStabilityRate`：扰动后检出状态与原事件一致的比例；
- `top1StabilityRate`：首位候选疑因保持一致的比例；
- `top3StabilityRate`：Top3带顺序的平均一致度，交换位置会扣分；
- `criticalDependencies`：逐个中和信号后，按检出翻转、Top1翻转和候选分值变化排序；
- `thresholdSensitivity`：对事件相关阈值执行0.8～1.2倍扫描，记录结论翻转点。

种子默认为事件ID的FNV-1a哈希，同一事件、配置和代码版本产生相同结果。`rankScore`仍是证据匹配排序，而非根因概率。

## 2. 故障指纹

`buildFaultFingerprint(kind, telemetry)`包含两层：

1. 语义时序：急减速、停止、目标进入近距区、置信度下降、风险跃升、横向越界、重规划和规划状态切换；
2. 数值特征：峰值减速度、静止时长、累计重规划、横向偏差、最近目标距离、置信度跌幅、风险峰值、速度跌幅及状态切换次数。

语义序列使用带时间和幅度衰减的加权最长公共子序列；数值层按各字段工程尺度计算指数距离。总相似度为：

```text
0.50 × 语义时序相似度
+ 0.40 × 数值特征相似度
+ 0.10 × 事件类型相似度
```

相似度用于召回和排序，不构成因果证明。

## 3. 历史案例库

`VERIFIED_HISTORY_CASES`内置12个参数化、已核验的合成案例，每类4个：

- 突然刹停：合理行人避让、跟踪失稳、策略保守、幽灵目标；
- 异常等待：释放条件、策略保守、定位漂移、真实占道；
- 异常绕行：合理施工绕行、地图不一致、定位偏移、幽灵障碍。

`retrieveSimilarCases`默认返回Top3，并同时给出共同语义事件和差异最大的三个数值特征。前端可在`useMemo`中直接调用；所有输入均只读，函数不会修改原事件。

## 4. 假设与边界

- 时刻`t`以秒计，可不等间隔，但必须可排序；超过约2.5个正常采样间隔的数据缺口会打断连续静止段。
- 当前演示的急停检出沿用`-1.5 m/s²`阈值；等待为12秒；绕行为横向偏差1.2米或重规划5次。
- 缺失字段在现有`TelemetryPoint`类型中不可表达；接入真实数据时，应在进入本模块前完成质量校验并显式记录缺失率。
- 规划状态文本只用于提取“状态发生变化”，不会依赖具体厂商枚举。
- 目标ID、原始视频、点云、规划代价和控制命令尚未进入演示数据，因此模块不能证明真实根因。
- 仅有三个候选原因时，Top3集合天然不变；本模块使用排序一致度避免输出没有信息量的固定100%。
- 空序列、单点序列和非法时间戳不会抛出异常；数值特征退化为安全默认值。
- 历史案例均标注为合成数据，不能作为生产准确率声明。

## 5. 前端推荐接口

```ts
const intelligence = useMemo(
  () => analyzeDiagnosticIntelligence(incident),
  [incident],
);

const certificate = intelligence.robustness;
const fingerprint = intelligence.fingerprint;
const top3 = intelligence.similarCases;
```

若页面仅展示单项，可分别调用`createRobustnessCertificate`、`buildFaultFingerprint`和`retrieveSimilarCases`。

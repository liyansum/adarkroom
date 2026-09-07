/* Missing upstream Simplified Chinese strings and expansion resource names. */
(function () {
  const translations = {
    'sound on.': '开启声音', 'sound off.': '关闭声音', 'Sound Available!': '荒野的声音',
    'enable audio': '开启声音', 'disable audio': '保持安静', 'ears flooded with new sensations.': '耳边涌入陌生的声响。',
    'perhaps silence is safer?': '或许安静更让人安心？', 'emits a soft red glow': '散发柔和的红光',
    'give in': '顺从', 'inviting. it would be so easy to give in, completely.': '令人向往。只需放松，就能完全沉入其中。',
    'a strange thrumming, pounding and crashing. and then gone.': '奇异的嗡鸣、敲击与轰响交织，又忽然消失。',
    'a strange thrumming, pounding and crashing. visions of people and places, of a huge machine and twisting curves.': '奇异的嗡鸣、敲击与轰响交织。人影、异地、巨大的机器和扭曲的弧线在眼前闪现。',
    'Penrose': '彭罗斯', 'stone': '石料', 'grain': '粮食', 'influence': '影响力'
  };
  _.setDynamicTranslator(key => lang === 'zh_cn' || lang === 'zh_tw' ? translations[key] || key : key);
})();

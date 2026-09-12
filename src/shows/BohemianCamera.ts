import type { MusicAnalysis } from '../lighting/MusicAnalysis';
import type { CameraShow, CameraCue, ShotFraming } from './CameraShow';

/** Authored against both the theatre acts and the lighting changes, not note density alone. */
export function prepareBohemianCamera(music: MusicAnalysis): CameraShow {
  const wide: ShotFraming = { target: [0, 5, -1], yaw: 0, pitch: .12, width: 30, height: 11, fov: 42 };
  const medium: ShotFraming = { ...wide, target: [0, 3.2, 0], width: 19, height: 6.5, pitch: .18, fov: 36 };
  const piano: ShotFraming = { subject: { type: 'piano', instance: 0 }, target: [0, .83, -.2], yaw: .55, pitch: .42, width: 3, height: 1.9, fov: 38 };
  const keys: ShotFraming = { ...piano, target: [0, .80, .47], yaw: -.35, pitch: .68, width: 1.7, height: .75, fov: 40 };
  const guitar: ShotFraming = { subject: { type: 'electric', instance: 0 }, target: [0, .7, .2], yaw: -.22, pitch: .13, width: 5.5, height: 8.8, fov: 35 };
  const bridge: ShotFraming = { ...guitar, target: [0, -1.45, .38], width: 2.1, height: 2.8, yaw: .24, pitch: .24, fov: 40 };
  const bass: ShotFraming = { subject: { type: 'bass', instance: 0 }, target: [0, .7, .2], yaw: -.3, pitch: .15, width: 5, height: 8, fov: 36 };
  const sax: ShotFraming = { subject: { type: 'saxophone', instance: 0 }, target: [0, .48, .05], yaw: .45, pitch: .12, width: 1.2, height: 1.3, fov: 38 };
  const keyboard: ShotFraming = { subject: { type: 'keyboard', instance: 0 }, target: [0, 9.1, -.15], yaw: .18, pitch: .60, width: 15.4, height: 7.2, fov: 36 };
  const drums: ShotFraming = { subject: { type: 'drums', instance: 0 }, target: [0, 1.65, -.4], yaw: Math.PI - .3, pitch: .86, width: 7.5, height: 4.6, fov: 36 };
  const authored: (Omit<CameraCue, 'time'> & { beat: number })[] = [
    { beat: 0, name: '序幕 · 留给幕布与合声', from: wide, to: { width: 28 } },
    // LED room act enters at beat 20: stay wide through the reveal before looking at the keys.
    { beat: 28, name: '窗前 · 琴键侧向缓推', from: keys, to: { yaw: -.18, width: 1.5, target: [.08, .80, .47] } },
    { beat: 44, name: '窗前 · 电子琴双层合声', from: keyboard, to: { yaw: .04, width: 14.8 } },
    { beat: 60, name: '琥珀换光 · 提前回舞台', from: wide, to: { yaw: -.06 } },
    { beat: 72, name: '独白 · 琴键长镜头', from: { ...keys, yaw: .28 }, to: { yaw: .12, width: 1.5 } },
    { beat: 94, name: '乐队渐入 · 让出换光', from: medium, to: { width: 23, height: 8 } },
    { beat: 112, name: '低声部 · 贝斯中景', from: bass, to: { yaw: -.12, width: 4.6 } },
    { beat: 126, name: '叙事 · 鼓手肩后俯拍', from: drums, to: { yaw: Math.PI - .12, width: 7.1 } },
    { beat: 144, name: '应答 · 萨克斯中景', from: sax, to: { yaw: .28, width: 1.05 } },
    { beat: 160, name: '叙事 · 舞台承接乐句', from: medium, to: { yaw: -.06 } },
    // This keyboard part rests until beat 170; keep the stage visible until its entrance.
    { beat: 170, name: '叙事 · 电子琴弦乐铺底', from: { ...keyboard, yaw: -.22 }, to: { yaw: -.06, width: 14.8 } },
    { beat: 180, name: '银蓝与阶梯 · 全景迎接新幕', from: wide, to: { width: 27, yaw: -.06 } },
    { beat: 196, name: '独奏 · 第一把电吉他', from: guitar, to: { yaw: .02, width: 5 } },
    { beat: 200, name: '独奏 · 琴桥与拨弦细节', from: bridge, to: { yaw: .12, width: 1.9 } },
    { beat: 208, name: '独奏 · 第二把电吉他与背光', from: { ...guitar, subject: { type: 'electric', instance: 1 }, yaw: .25 }, to: { yaw: .1 } },
    { beat: 218, name: '歌剧开幕 · 法庭全景', from: wide, to: { width: 28 } },
    { beat: 244, name: '左右对答 · 轻微侧移', from: { ...wide, width: 28 }, to: { yaw: .10 }, transition: { kind: 'glide', seconds: 1.4 } },
    { beat: 270, name: '面具与光束 · 回到正面', from: { ...wide, yaw: .10 }, to: { yaw: 0, width: 30 }, transition: { kind: 'glide', seconds: 1.4 } },
    { beat: 296, name: '赤金爆发 · 正面全景切入', from: { ...wide, width: 28, pitch: .07 }, to: { width: 26 } },
    { beat: 320, name: '摇滚 · 鼓面与镲片俯视', from: { ...drums, yaw: .20, pitch: 1.15 }, to: { yaw: -.08, width: 7.0 } },
    { beat: 344, name: '摇滚 · 灯光与屏幕完整展开', from: { ...wide, yaw: .12 }, to: { yaw: -.02 } },
    { beat: 374, name: '银白风暴 · 留足换光空间', from: { ...wide, width: 30, pitch: .08 }, to: { width: 27 } },
    { beat: 406, name: '海幕 · 退回夜色', from: wide, to: { width: 29 }, transition: { kind: 'glide', seconds: 1.8 } },
    { beat: 420, name: '尾声 · 萨克斯最后的应答', from: sax, to: { yaw: .28, width: 1.05 } },
    { beat: 430, name: '尾声 · 电子琴与弦乐余韵', from: { ...keyboard, yaw: .28 }, to: { yaw: .12, width: 14.8 } },
    { beat: 450, name: '尾声 · 最后的琴键', from: keys, to: { yaw: -.1, width: 1.6 } },
    { beat: 462, name: '终幕 · 全景等待最后一束光', from: wide, to: { width: 32, pitch: .10 } },
  ];
  return { id: 'bohemian-camera-v1', duration: music.duration,
    cues: authored.map(({ beat, ...cue }) => ({ ...cue, time: music.secondsAtBeat(beat) })) };
}

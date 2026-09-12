import { createConcertShow, type ConcertSection } from '../ConcertShow.ts';

/** Beat locations and palettes authored for the exact MIDI supplied with the reference. */
export const BOHEMIAN_SECTIONS: readonly ConcertSection[] = [
 {beat:0,   name:'序幕 · 合声微光',    kind:'overture',color:'#82bddb',second:'#d9a976',power:.30},
 {beat:20,  name:'序幕 · 窗前琴声',    kind:'piano',color:'#6faedb',second:'#ecc594',power:.40},
 {beat:64,  name:'叙事 · 琥珀独白',    kind:'ballad',color:'#edb77d',second:'#546ba5',power:.43},
 {beat:100, name:'叙事 · 乐队渐入',    kind:'rise',color:'#dc9d70',second:'#759dd7',power:.61},
 {beat:186, name:'独奏 · 银蓝交锋',    kind:'solo',color:'#8bdde8',second:'#a087e3',power:.80},
 {beat:222, name:'歌剧 · 左右对答',    kind:'opera',color:'#9da7ff',second:'#e4b57a',power:.77},
 {beat:252, name:'歌剧 · 面具法庭',    kind:'spiral',color:'#b698e7',second:'#8ee2dd',power:.88},
 {beat:296, name:'摇滚 · 赤金爆发',    kind:'rock',color:'#f47b4d',second:'#f4d6a1',power:1.04},
 {beat:378, name:'摇滚 · 银白风暴',    kind:'storm',color:'#d6e9ee',second:'#ef754f',power:1.12},
 {beat:410, name:'尾声 · 重回夜色',    kind:'coda',color:'#75a7cf',second:'#d8b68d',power:.47},
 {beat:466, name:'终曲 · 最后一束光',  kind:'farewell',color:'#bbcede',second:'#ddba8d',power:.32}
];

export const bohemianRhapsody = createConcertShow({
  id: 'bohemian-rhapsody', title: '波西米亚狂想曲', sections: BOHEMIAN_SECTIONS,
});

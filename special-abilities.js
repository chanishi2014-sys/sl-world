/* Shared original player-editor catalogue. Category is explicit data, never inferred from a name. */
(()=>{'use strict';
const SPECIALS = {

batting:[

["アベレージヒッター","blue"],
["安打製造機","gold"],
["パワーヒッター","blue"],
["長距離砲","gold"],
["引っ張り屋","blue"],
["流し打ち","blue"],
["広角打法","gold"],
["ラインドライブ","blue"],
["アーチスト","gold"],
["選球眼","blue"],
["悪球打ち","blue"],
["粘り打ち","blue"],
["バント○","blue"],
["バント職人","blue"],
["満塁男","blue"],
["サヨナラ男","blue"],
["逆境","blue"],
["内野安打○","blue"],
["代打○","blue"],
["固め打ち","blue"],
["連打○","blue"],
["チャンスメーカー","blue"],
["チャンス○","blue"],
["チャンス◎","gold"],
["ローボールヒッター","blue"],
["ハイボールヒッター","blue"],
["いぶし銀","blue"],
["打者威圧感","gold"],
["三振癖","red"],
["対左×","red"],
["対右×","red"],
["悪球癖","red"],
["チャンス×","red"],
["バント×","red"]

],

running:[

["走塁○","blue"],
["韋駄天","gold"],
["走塁×","red"],
["盗塁○","blue"],
["影走","gold"],
["盗塁×","red"],
["守備職人","blue"],
["広域守備","gold"],
["好捕球","blue"],
["ゲッツー職人","blue"],
["送球○","blue"],
["レーザービーム","gold"],
["送球×","red"],
["エラー癖","red"],
["キャッチャー○","blue"],
["名捕手","gold"],
["盗塁阻止○","blue"],
["ブロック○","blue"]

],

pitcher:[

["ノビ○","blue"],
["怪童","gold"],
["キレ○","blue"],
["キレ味抜群","gold"],
["重い球","blue"],
["奪三振","gold"],
["低め○","blue"],
["緩急○","blue"],
["リリース○","blue"],
["逃げ球","blue"],
["投手威圧感","gold"],

["対左打者○","blue"],
["対右打者○","blue"],
["ピンチ○","blue"],
["不屈","gold"],
["立ち上がり○","blue"],
["尻上がり","blue"],
["クイック○","blue"],
["牽制○","blue"],
["クロスファイヤー","blue"],

["力配分","blue"],
["回復○","blue"],


["ノビ×","red"],
["キレ×","red"],
["軽い球","red"],
["ピンチ×","red"],
["四球癖","red"]

],

common:[

["安定感","blue"],
["ムラっ気","green"],
["大舞台○","blue"],
["プレッシャー×","red"],
["人気者","green"],
["スーパースター","gold"],
["ケガ○","blue"],
["ケガ×","red"],
["ムード○","blue"],
["ムード×","red"],
["ムードメーカー","green"],
["積極打法","green"],
["慎重打法","green"],
["積極盗塁","green"],
["慎重盗塁","green"],
["代打要員","green"],
["代走要員","green"],
["守備要員","green"],
["チームプレー○","green"],
["チームプレー×","green"]

],

// 正式超特殊能力：分類は表示・投手登録判定に使用。所持数上限は設けない。
super:[
["勝負師","rainbow","fielder"],
["本塁打王","rainbow","fielder"],
["電光石火","rainbow","fielder"],
["全方位打法","rainbow","fielder"],
["打撃の極致","rainbow","fielder"],
["球界の頭脳","rainbow","fielder"],
["絶対領域","rainbow","fielder"],
["華麗なる守備","rainbow","fielder"],
["外野の覇者","rainbow","fielder"],
["光速返球","rainbow","fielder"],
["絶対的エース","rainbow","pitcher"],
["勝利の架け橋","rainbow","pitcher"],
["守護神","rainbow","pitcher"],
["タフネス","rainbow","pitcher"],
["変幻自在","rainbow","pitcher"],
["精密機械","rainbow","pitcher"],
["怪物球威","rainbow","pitcher"],
["ミスターK","rainbow","pitcher"],
["鉄仮面","rainbow","pitcher"],
["強心臓","rainbow","pitcher"]
]

};
const definitions=new Map();
for(const [group,entries]of Object.entries(SPECIALS))for(const [name,color,registration]of entries)definitions.set(name,Object.freeze({name,color,group,registration}));
globalThis.SL_SPECIALS=SPECIALS;
globalThis.SL_TRAITS=Object.freeze({get:name=>definitions.get(name)||null});
})();

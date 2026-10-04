import { useAtlas } from '../store/atlas';

/** Malaysia below state level: districts (daerah) or parliamentary constituencies (parlimen). */
export function MyDivisionSwitch() {
  const { lang, myDivision, setMyDivision } = useAtlas();
  const ms = lang === 'ms';
  return (
    <div className="seg seg-xs" role="radiogroup" aria-label={ms ? 'Pembahagian Malaysia' : 'Malaysia division'}>
      <button className={myDivision === 'district' ? 'on' : ''} onClick={() => setMyDivision('district')} role="radio" aria-checked={myDivision === 'district'}>{ms ? 'Daerah' : 'Districts'}</button>
      <button className={myDivision === 'parlimen' ? 'on' : ''} onClick={() => setMyDivision('parlimen')} role="radio" aria-checked={myDivision === 'parlimen'}>{ms ? 'Parlimen' : 'Constituencies'}</button>
    </div>
  );
}

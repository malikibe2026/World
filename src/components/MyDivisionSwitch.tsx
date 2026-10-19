import { useAtlas } from '../store/atlas';
import { divisionLabel, type MyDivision } from '../utils/geoRefs';

const DIVISIONS: MyDivision[] = ['district', 'parlimen', 'dun'];

/** Malaysia below state level: districts (daerah), parliamentary constituencies (parlimen) or state seats (DUN). */
export function MyDivisionSwitch() {
  const { lang, myDivision, setMyDivision } = useAtlas();
  return (
    <div className="seg seg-xs" role="radiogroup" aria-label={lang === 'ms' ? 'Pembahagian Malaysia' : 'Malaysia division'}>
      {DIVISIONS.map((d) => (
        <button key={d} className={myDivision === d ? 'on' : ''} onClick={() => setMyDivision(d)} role="radio" aria-checked={myDivision === d}>{divisionLabel(d, lang)}</button>
      ))}
    </div>
  );
}

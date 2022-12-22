import InequalityFilter from "./InequalityFilter";
import { useSearch } from "./SearchContext";
import SelectionFilter from "./SelectionFilter";
import "./styles.css";
import { getBeamTypes } from "./Db";

export default function App() {
  const { validBeamsArr, clearSearch, getFilteredBeamNames } = useSearch();

  const handleClear = (e) => {
    e.preventDefault();
    clearSearch();
  };

  return (
    <div className="App">
      <h1>Find a Beam</h1>
      <h2>Search</h2>
      <form id="search-criteria">
        <SelectionFilter attribute="Type" dropdownItemsArray={getBeamTypes()} />
        <InequalityFilter attribute="Weight" unit="lb/ft" />
        <InequalityFilter attribute="Area" unit="in^2" />
        <SelectionFilter
          attribute="Name"
          dropdownItemsArray={getFilteredBeamNames()}
        />
        <button onClick={handleClear}>Clear Search</button>
      </form>
      <h2>{validBeamsArr.length} Results</h2>
      <ol>
        {validBeamsArr.map((beam, i) => (
          <li key={i}>{JSON.stringify(beam)}</li>
        ))}
      </ol>
      <p>Contact Zack Ebenfeld at zackebenfeld@gmail.com.</p>
    </div>
  );
}

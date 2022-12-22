import React from "react";
import { useSearch } from "./SearchContext";

const SelectionFilter = ({ attribute, dropdownItemsArray }) => {
  const { search, handleChange, clearField } = useSearch();
  return (
    <div
      id={attribute}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div style={{ marginInline: "4px" }}>{attribute}</div>
      <select
        id={`${attribute.toLowerCase()}-filter`}
        value={search[`${attribute.toLowerCase()}-filter`]}
        onChange={handleChange}
      >
        <option default>Any</option>
        {dropdownItemsArray.map((beamAttribute, i) => (
          <option key={i}>{beamAttribute}</option>
        ))}
      </select>
      {search[`${attribute.toLowerCase()}-filter`] !== "Any" && (
        <button onClick={() => clearField(attribute)}>X</button>
      )}
    </div>
  );
};

export default SelectionFilter;

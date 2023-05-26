import React from "react";
import { useSearch } from "./SearchContext";

const InequalityFilter = ({ attribute, unit }) => {
  const { search, handleChange } = useSearch();

  return (
    <div
      id={attribute.toLowerCase()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div style={{ marginInline: "4px" }}>{attribute}</div>
      <select
        id={`${attribute.toLowerCase()}-operator`}
        value={search[`${attribute.toLowerCase()}-operator`]}
        onChange={handleChange}
      >
        <option>{">"}</option>
        <option>{"<"}</option>
        <option>{"="}</option>
      </select>
      <input
        type="number"
        id={`${attribute.toLowerCase()}-value`}
        value={search[`${attribute.toLowerCase()}-value`]}
        onChange={handleChange}
        style={{ width: "40px" }}
      ></input>
      <div style={{ marginInline: "4px" }}>{unit}</div>
    </div>
  );
};

export default InequalityFilter;

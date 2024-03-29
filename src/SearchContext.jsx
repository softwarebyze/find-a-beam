import React, { useCallback, useContext, useEffect, useState } from "react";
import { beamsArr } from "./Db";

const SearchContext = React.createContext();

export function useSearch() {
  return useContext(SearchContext);
}

export function SearchProvider({ children }) {
  const defaultSearch = {
    "name-filter": "Any",
    "type-filter": "Any",
    "weight-value": "",
    "area-value": "",
    "ix-value": "",
    "iy-value": "",
    "weight-operator": "<",
    "area-operator": ">",
    "ix-operator": ">",
    "iy-operator": ">",
    "depth-operator": ">",
    "depth-value": "",
  };
  const [search, setSearch] = useState(defaultSearch);
  const [validBeamsArr, setValidBeamsArr] = useState(beamsArr);

  const clearSearch = () => {
    setSearch(() => defaultSearch);
  };

  const clearField = (attribute) => {
    setSearch({ ...search, [`${attribute.toLowerCase()}-filter`]: "Any" });
  };

  const handleChange = (e) => {
    e.preventDefault();
    setSearch({ ...search, [e.target.id]: e.target.value });
  };

  const filterByMatch = (arr, attribute, search) => {
    return arr.filter(
      (b) => b[attribute] === search[`${attribute.toLowerCase()}-filter`]
    );
  };

  const filterByInequality = (arr, attribute, search) => {
    console.log('filter ', arr, 'by', attribute, 'search', search)
    const operator = search[`${attribute.toLowerCase()}-operator`];
    switch (operator) {
      case ">":
        return arr.filter(
          (b) =>
            +b[attribute.toLowerCase()] >
            +search[`${attribute.toLowerCase()}-value`]
        );
      case "<":
        return arr.filter(
          (b) =>
            +b[attribute.toLowerCase()] <
            +search[`${attribute.toLowerCase()}-value`]
        );
      case "=":
        return arr.filter(
          (b) =>
            +b[attribute.toLowerCase()] ===
            +search[`${attribute.toLowerCase()}-value`]
        );
      default:
        break;
    }
  };

  const filterResults = useCallback((search) => {
    let filteredBeamsArr = beamsArr;
    //filter by type
    if (search["type-filter"] !== "Any") {
      filteredBeamsArr = filterByMatch(filteredBeamsArr, "type", search);
    }
    //filter by weight
    if (search["weight-value"] !== "") {
      filteredBeamsArr = filterByInequality(filteredBeamsArr, "weight", search);
    }
    //filter by area
    if (search["area-value"] !== "") {
      filteredBeamsArr = filterByInequality(filteredBeamsArr, "area", search);
    }
    //filter by moment of inertia about x-axis
    if (search["ix-value"] !== "") {
      filteredBeamsArr = filterByInequality(filteredBeamsArr, "Ix", search);
    }
    //filter by moment of inertia about y-axis
    if (search["iy-value"] !== "") {
      filteredBeamsArr = filterByInequality(filteredBeamsArr, "Iy", search);
    }
    //filter by name
    if (search["name-filter"] !== "Any") {
      filteredBeamsArr = filterByMatch(filteredBeamsArr, "name", search);
    }
    //filter by depth
    if (search["depth-filter"] !== "") {
      filteredBeamsArr = filterByInequality(filteredBeamsArr, "depth", search);
    }
    //setValidBeamsArr
    setValidBeamsArr(filteredBeamsArr);
  }, []);

  useEffect(() => {
    filterResults(search);
  }, [search, filterResults]);

  const getFilteredBeamNames = () => {
    return validBeamsArr.map((b) => b.name);
  };

  const getFilteredBeamTypes = () => {
    return validBeamsArr
      .map((b) => b.type)
      .filter((v, i, a) => a.indexOf(v) === i);
  };

  const value = {
    search,
    handleChange,
    validBeamsArr,
    clearSearch,
    clearField,
    getFilteredBeamNames,
    getFilteredBeamTypes
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

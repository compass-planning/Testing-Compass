import React, { createContext, useContext, useState } from "react";

const Ctx = createContext(null);
export const useHousehold = () => useContext(Ctx);

const KEY_ID = "compass_active_household";
const KEY_NAME = "compass_active_household_name";

export function HouseholdProvider({ children }) {
  const [active, setActiveState] = useState(() => localStorage.getItem(KEY_ID) || null);
  const [name, setName] = useState(() => localStorage.getItem(KEY_NAME) || "");

  const setActive = (id, nm = "") => {
    if (id) {
      localStorage.setItem(KEY_ID, id);
      localStorage.setItem(KEY_NAME, nm || "");
    } else {
      localStorage.removeItem(KEY_ID);
      localStorage.removeItem(KEY_NAME);
    }
    setActiveState(id || null);
    setName(nm || "");
  };
  const clear = () => setActive(null, "");

  return <Ctx.Provider value={{ active, name, setActive, clear }}>{children}</Ctx.Provider>;
}

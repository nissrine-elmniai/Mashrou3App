import { useEffect } from "react";

/** Ancienne route — redirige vers l’écran de connexion unifié */
export default function SupervisorLoginScreen({ navigation }) {
  useEffect(() => {
    navigation.replace("Login");
  }, [navigation]);

  return null;
}

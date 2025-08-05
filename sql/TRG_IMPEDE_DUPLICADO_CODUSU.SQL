CREATE OR REPLACE TRIGGER TRG_IMPEDE_DUPLICADO_CODUSU
BEFORE INSERT ON AD_APPPERM
FOR EACH ROW
DECLARE
  v_count NUMBER;
BEGIN
  -- Verifica se já existe um registro com o mesmo CODUSU
  SELECT COUNT(1)
  INTO v_count
  FROM AD_APPPERM
  WHERE CODUSU = :NEW.CODUSU;

  -- Se encontrou algum registro (v_count > 0), dispara um erro
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'O USUÁRIO ' || :NEW.CODUSU || ' já existe na tabela AD_APPPERM.');
  END IF;
END;
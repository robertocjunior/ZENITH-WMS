CREATE OR REPLACE TRIGGER TRG_IMPEDE_DUPLICADO_PERMEND
BEFORE INSERT ON AD_PERMEND
FOR EACH ROW
DECLARE
  v_count NUMBER;
BEGIN
  -- Verifica se já existe um registro com a mesma combinação de NUMREG e CODARM
  SELECT COUNT(1)
  INTO v_count
  FROM AD_PERMEND
  WHERE NUMREG = :NEW.NUMREG
    AND CODARM = :NEW.CODARM;

  -- Se a contagem for maior que zero, significa que a combinação já existe, então dispara o erro
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20002, 'O Armazém ' || :NEW.CODARM || ' já está cadastrado para o NUMREG ' || :NEW.NUMREG || '.');
  END IF;
END;
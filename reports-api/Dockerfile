# --------- build stage ---------
FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app

# сначала pom.xml, чтобы кэшировать зависимости
COPY pom.xml .
RUN mvn -B dependency:go-offline

# теперь исходники
COPY src ./src

# сборка jar
RUN mvn -B clean package -DskipTests


# --------- runtime stage ---------
FROM eclipse-temurin:17-jre

WORKDIR /app

# копируем собранный jar
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8000

ENTRYPOINT ["java", "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005", "-jar", "/app/app.jar"]